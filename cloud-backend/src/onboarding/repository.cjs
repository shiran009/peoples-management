const {randomUUID}=require('node:crypto');
const {DynamoDBClient}=require('@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient,GetCommand,ScanCommand,TransactWriteCommand}=require('@aws-sdk/lib-dynamodb');
const {withWriteLock,leaseCheck}=require('../shared/write-lock.cjs');
const {HttpError}=require('../auth/service.cjs');
function createOnboardingRepository(control=process.env.DATA_TABLE,options={}){
 const prefix=options.prefix??process.env.HR_TABLE_PREFIX;
 const client=options.client||DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}});
 function table(){if(prefix!=='peopleshr-'||!control)throw new HttpError(503,'Onboarding storage is not configured');return prefix+'onboarding_profiles'}
 return {
  async ready(){const name=table();const r=await client.send(new GetCommand({TableName:control,Key:{collection:'_migration',recordKey:'SEPARATE_TABLES_V1'},ConsistentRead:true}));if(r.Item?.status!=='COMPLETE'||r.Item.prefix!==prefix||!r.Item.tables?.some(t=>t.source==='onboarding_profiles'&&t.table===name))throw new HttpError(503,'Onboarding migration is incomplete')},
  withWriteLock(work){table();return withWriteLock(client,control,work)},
  async profiles(candidateId){const rows=[];let cursor;do{const r=await client.send(new ScanCommand({TableName:table(),FilterExpression:'#c=:c',ExpressionAttributeNames:{'#c':'candidateId'},ExpressionAttributeValues:{':c':candidateId},ExclusiveStartKey:cursor,ConsistentRead:true}));rows.push(...(r.Items||[]));cursor=r.LastEvaluatedKey}while(cursor);return rows},
  async save(lease,previous,next){
   if(previous&&previous.candidateId!==next.candidateId)throw new HttpError(409,'Profile ownership changed');
   const names={'#k':'_hrRecordKey'};let values;let condition='attribute_not_exists(#k)';
   if(previous){names['#v']='_hrRevision';names['#c']='candidateId';values={':c':next.candidateId};condition='attribute_exists(#k) AND #c=:c AND '+(previous._hrRevision===undefined?'attribute_not_exists(#v)':'#v=:v');if(previous._hrRevision!==undefined)values[':v']=previous._hrRevision}
   const item={...next,_hrRecordKey:JSON.stringify([next.id]),_hrRevision:(previous?._hrRevision||0)+1};
   try{await client.send(new TransactWriteCommand({ClientRequestToken:randomUUID(),TransactItems:[leaseCheck(control,lease),{Put:{TableName:table(),Item:item,ConditionExpression:condition,ExpressionAttributeNames:names,...(values?{ExpressionAttributeValues:values}:{})}}]}))}
   catch(e){if(['TransactionCanceledException','TransactionConflictException','ConditionalCheckFailedException'].includes(e.name))throw new HttpError(409,'The profile changed; reload and retry');throw e}
  }
 };
}
module.exports={createOnboardingRepository};
