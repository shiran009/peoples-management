const {randomUUID}=require('node:crypto');
const {UpdateCommand,DeleteCommand}=require('@aws-sdk/lib-dynamodb');
const {HttpError}=require('../auth/service.cjs');
const lockKey={collection:'_system',recordKey:'HR_WRITE_LOCK'};
async function withWriteLock(client,control,work){
 const owner=randomUUID();const now=Date.now();
 try{await client.send(new UpdateCommand({TableName:control,Key:lockKey,UpdateExpression:'SET #o=:o,#u=:u',ConditionExpression:'attribute_not_exists(#o) OR #u < :now',ExpressionAttributeNames:{'#o':'owner','#u':'leaseUntil'},ExpressionAttributeValues:{':o':owner,':u':now+35000,':now':now}}))}
 catch(e){if(e.name==='ConditionalCheckFailedException')throw new HttpError(409,'Another HR update is in progress; retry');throw e}
 try{return await work({owner})}finally{
  try{await client.send(new DeleteCommand({TableName:control,Key:lockKey,ConditionExpression:'#o=:o',ExpressionAttributeNames:{'#o':'owner'},ExpressionAttributeValues:{':o':owner}}))}
  catch(e){console.error('HR write lock release failed',{name:e.name})}
 }
}
function leaseCheck(control,lease){
 if(!lease?.owner)throw new Error('Write lease required');
 return {ConditionCheck:{TableName:control,Key:lockKey,ConditionExpression:'#o=:o AND #u>=:now',ExpressionAttributeNames:{'#o':'owner','#u':'leaseUntil'},ExpressionAttributeValues:{':o':lease.owner,':now':Date.now()}}};
}
module.exports={withWriteLock,leaseCheck};
