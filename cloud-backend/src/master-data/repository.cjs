const {randomUUID}=require('node:crypto');
const {DynamoDBClient}=require('@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient,GetCommand,ScanCommand,TransactWriteCommand}=require('@aws-sdk/lib-dynamodb');
const {readTables,writeTables}=require('./config.cjs');
const {HttpError}=require('../auth/service.cjs');
const {withWriteLock,leaseCheck}=require('../shared/write-lock.cjs');
const key=id=>JSON.stringify([id]);
function createMasterRepository(control=process.env.DATA_TABLE,options={}){
 const prefix=options.prefix??process.env.HR_TABLE_PREFIX;
 const client=options.client||DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}});
 const check=(table,write=false)=>{if(prefix!=='peopleshr-'||!(write?writeTables:readTables).includes(table))throw new HttpError(503,'This HR operation is not configured')};
 return {
  async ready(){
   if(!control||prefix!=='peopleshr-')throw new HttpError(503,'HR master data is not configured');
   const r=await client.send(new GetCommand({TableName:control,Key:{collection:'_migration',recordKey:'SEPARATE_TABLES_V1'},ConsistentRead:true}));
   if(r.Item?.status!=='COMPLETE'||r.Item.prefix!==prefix||readTables.some(name=>!r.Item.tables?.some(t=>t.table===prefix+name&&t.source===name)))throw new HttpError(503,'HR table migration is incomplete');
  },
  async list(table){
   check(table);const result=[];let cursor;
   do{const page=await client.send(new ScanCommand({TableName:prefix+table,ExclusiveStartKey:cursor,ConsistentRead:true}));result.push(...(page.Items||[]));cursor=page.LastEvaluatedKey}while(cursor);
   return result;
  },
  async get(table,id){check(table);return (await client.send(new GetCommand({TableName:prefix+table,Key:{_hrRecordKey:key(id)},ConsistentRead:true}))).Item},
  withWriteLock(work){return withWriteLock(client,control,work)},
  async commit(lease,table,previous,next,audit){
   check(table,true);if(!lease?.owner)throw new Error('Write lease required');
   const oldVersion=previous?._hrRevision;const id=next?.id??previous?.id;
   let condition='attribute_not_exists(#key)';let names={'#key':'_hrRecordKey'};let values;
   if(previous){condition='attribute_exists(#key) AND '+(oldVersion===undefined?'attribute_not_exists(#v)':'#v=:v');names['#v']='_hrRevision';if(oldVersion!==undefined)values={':v':oldVersion}}
   const write={TableName:prefix+table,ConditionExpression:condition,ExpressionAttributeNames:names,...(values?{ExpressionAttributeValues:values}:{})};
   const entity=next?{Put:{...write,Item:{...next,_hrRecordKey:key(id),_hrRevision:(oldVersion||0)+1}}}:{Delete:{...write,Key:{_hrRecordKey:key(id)}}};
   try{await client.send(new TransactWriteCommand({ClientRequestToken:randomUUID(),TransactItems:[
    leaseCheck(control,lease),entity,
    {Put:{TableName:prefix+'eim_audit_logs',Item:{...audit,_hrRecordKey:key(audit.id)},ConditionExpression:'attribute_not_exists(#key)',ExpressionAttributeNames:{'#key':'_hrRecordKey'}}}
   ]}))}catch(e){if(['TransactionCanceledException','ConditionalCheckFailedException','TransactionConflictException'].includes(e.name))throw new HttpError(409,'The record changed; reload and retry');throw e}
  }
 };
}
module.exports={createMasterRepository};