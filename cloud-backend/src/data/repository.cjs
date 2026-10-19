const {DynamoDBClient}=require('@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient,QueryCommand,GetCommand,ScanCommand}=require('@aws-sdk/lib-dynamodb');
const allowed=new Set(['users','employee_information_employees','employee_information_personal_details','eim_structures','designations','onboarding_profiles','invites','contracts','documents','attendance_records','leave_applications','attendance_exceptions','attendance_roster_assignments','attendance_roster_groups','attendance_roster_group_shifts','attendance_shifts','hr_performance_reviews']);
function createDataRepository(table=process.env.DATA_TABLE,options={}){
 const prefix=options.prefix??process.env.HR_TABLE_PREFIX??'';
 if(prefix && prefix!=='peopleshr-')throw new Error('Unsupported HR table prefix');
 const client=options.client||DynamoDBDocumentClient.from(new DynamoDBClient({}));
 return {
  async ready(){
   if(!table)throw Object.assign(new Error('HR data migration is not configured'),{status:503});
   const marker=prefix?'SEPARATE_TABLES_V1':'IMPORT';
   const r=await client.send(new GetCommand({TableName:table,Key:{collection:'_migration',recordKey:marker},ConsistentRead:true}));
   if(r.Item?.status!=='COMPLETE'||(prefix&&(r.Item.prefix!==prefix||!Array.isArray(r.Item.tables)||[...allowed].some(c=>!r.Item.tables.some(t=>t.source===c&&t.table===prefix+c)))))
    throw Object.assign(new Error('HR data import is not complete'),{status:503});
  },
  async probe(){
   await this.ready();
   if(prefix)await Promise.all([...allowed].map(collection=>client.send(new ScanCommand({TableName:prefix+collection,Limit:1,ProjectionExpression:'#key',ExpressionAttributeNames:{'#key':'_hrRecordKey'},ConsistentRead:true}))));
  },
  async list(collection){
   if(!allowed.has(collection))throw new Error('Unsupported collection');
   const rows=[];let cursor;
   do{
    const command=prefix?new ScanCommand({TableName:prefix+collection,ExclusiveStartKey:cursor,ConsistentRead:true}):new QueryCommand({TableName:table,KeyConditionExpression:'#c=:c',ExpressionAttributeNames:{'#c':'collection'},ExpressionAttributeValues:{':c':collection},ExclusiveStartKey:cursor,ConsistentRead:true});
    const result=await client.send(command);
    rows.push(...(result.Items||[]));cursor=result.LastEvaluatedKey;
   }while(cursor);
   if(!prefix)return rows.map(i=>i.data);
   // Preserve the old query ordering because Scan has no ordering guarantee.
   rows.sort((a,b)=>a._hrRecordKey<b._hrRecordKey?-1:a._hrRecordKey>b._hrRecordKey?1:0);
   return rows.map(({_hrRecordKey,...data})=>data);
  }
 };
}
module.exports={createDataRepository,collections:[...allowed]};