const fs=require('node:fs');
async function main(){
 const filename=process.argv[2];if(!filename)throw new Error('Provide the private auth export path');
 const payload=JSON.parse(fs.readFileSync(filename,'utf8'));
 if(payload.format!=='hr-auth-v1'||!Array.isArray(payload.records)||!payload.records.length)throw new Error('Invalid auth export');
 const records=payload.records;
 const seenIds=new Set(),seenEmails=new Set();
 for(const r of records){
 if(!r.id||typeof r.email!=='string'||typeof r.password!=='string')throw new Error('Invalid account');
 const email=r.email.trim().toLowerCase();if(seenIds.has(r.id)||seenEmails.has(email))throw new Error('Duplicate account');seenIds.add(r.id);seenEmails.add(email);
 if(Buffer.byteLength(JSON.stringify(r))>350000)throw new Error('Account too large');
 }
 const table=process.env.AUTH_TABLE;if(!table||!process.env.EXPECTED_AWS_ACCOUNT)throw new Error('Set AUTH_TABLE and EXPECTED_AWS_ACCOUNT');
 const region=process.env.AWS_REGION||'ap-southeast-2';
 const {STSClient,GetCallerIdentityCommand}=require('@aws-sdk/client-sts');
 const caller=await new STSClient({region}).send(new GetCallerIdentityCommand({}));if(caller.Account!==process.env.EXPECTED_AWS_ACCOUNT)throw new Error('AWS account mismatch');
 const {DynamoDBClient}=require('@aws-sdk/client-dynamodb');const {DynamoDBDocumentClient,ScanCommand,TransactWriteCommand,PutCommand}=require('@aws-sdk/lib-dynamodb');
 const client=DynamoDBDocumentClient.from(new DynamoDBClient({region}),{marshallOptions:{removeUndefinedValues:true}});
 const existing=await client.send(new ScanCommand({TableName:table,Limit:1,ConsistentRead:true}));if(existing.Items?.length)throw new Error('Target not empty; no records overwritten');
 for(const user of records)await client.send(new TransactWriteCommand({TransactItems:[
 {Put:{TableName:table,Item:{pk:'USER#'+user.id,data:user},ConditionExpression:'attribute_not_exists(pk)'}},
 {Put:{TableName:table,Item:{pk:'EMAIL#'+user.email.trim().toLowerCase(),userId:user.id},ConditionExpression:'attribute_not_exists(pk)'}}]}));
 await client.send(new PutCommand({TableName:table,Item:{pk:'MIGRATION#AUTH',status:'COMPLETE',users:records.length,completedAt:new Date().toISOString()},ConditionExpression:'attribute_not_exists(pk)'}));
 console.log('AUTH_IMPORT_COMPLETE users='+records.length);
}
main().catch(e=>{console.error('Import stopped:',e.name,e.message);process.exitCode=1});
