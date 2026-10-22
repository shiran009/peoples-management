const {DynamoDBClient}=require('@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient,GetCommand,ScanCommand}=require('@aws-sdk/lib-dynamodb');
const {HttpError}=require('../auth/service.cjs');
function createReadRepository(readTables,control=process.env.DATA_TABLE,options={}){
 const prefix=options.prefix??process.env.HR_TABLE_PREFIX;
 const client=options.client||DynamoDBDocumentClient.from(new DynamoDBClient({}));
 function table(name){if(prefix!=='peopleshr-'||!control||!readTables.includes(name))throw new HttpError(503,'HR storage is not configured');return prefix+name}
 return {
  async ready(){table(readTables[0]);const r=await client.send(new GetCommand({TableName:control,Key:{collection:'_migration',recordKey:'SEPARATE_TABLES_V1'},ConsistentRead:true}));if(r.Item?.status!=='COMPLETE'||r.Item.prefix!==prefix||readTables.some(n=>!r.Item.tables?.some(t=>t.source===n&&t.table===prefix+n)))throw new HttpError(503,'HR data migration is incomplete')},
  async list(name,filter){const rows=[];let cursor;const query=filter?{FilterExpression:'#field=:value',ExpressionAttributeNames:{'#field':filter.field},ExpressionAttributeValues:{':value':filter.value}}:{};if(filter&&!['employeeId','candidateId','userId'].includes(filter.field))throw new Error('Unsupported employee filter');do{const page=await client.send(new ScanCommand({TableName:table(name),...query,ExclusiveStartKey:cursor,ConsistentRead:true}));rows.push(...(page.Items||[]));cursor=page.LastEvaluatedKey}while(cursor);rows.sort((a,b)=>String(a._hrRecordKey).localeCompare(String(b._hrRecordKey)));return rows}
 };
}
module.exports={createReadRepository};
