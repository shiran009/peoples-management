const fs=require('node:fs');
const {STSClient,GetCallerIdentityCommand}=require('@aws-sdk/client-sts');
const {DynamoDBClient,DescribeTableCommand}=require('@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient,ScanCommand,BatchWriteCommand,QueryCommand,PutCommand}=require('@aws-sdk/lib-dynamodb');
async function main(){
 const filename=process.argv[2], table=process.env.DATA_TABLE;
 if(!filename||!table||!process.env.EXPECTED_AWS_ACCOUNT)throw new Error('Set DATA_TABLE and EXPECTED_AWS_ACCOUNT and provide export path');
 const payload=JSON.parse(fs.readFileSync(filename,'utf8'));
 if(payload.format!=='hr-collections-v1'||!Array.isArray(payload.collections))throw new Error('Invalid collection export');
 const seenCollections=new Set();let total=0;
 for(const c of payload.collections){
  if(typeof c.name!=='string'||c.name==='_migration'||seenCollections.has(c.name)||!Array.isArray(c.items)||c.items.length!==c.count)throw new Error('Invalid collection manifest');
  seenCollections.add(c.name);const keys=new Set();
  for(const item of c.items){
   if(item.collection!==c.name||typeof item.recordKey!=='string'||!item.data||keys.has(item.recordKey)||Buffer.byteLength(item.recordKey)>1024||Buffer.byteLength(JSON.stringify(item))>350000)throw new Error('Invalid collection record');
   keys.add(item.recordKey);
  }total+=c.count;
 }
 const region=process.env.AWS_REGION||'ap-southeast-2';
 const identity=await new STSClient({region}).send(new GetCallerIdentityCommand({}));
 if(identity.Account!==process.env.EXPECTED_AWS_ACCOUNT)throw new Error('AWS account mismatch');
 const raw=new DynamoDBClient({region});
 const description=await raw.send(new DescribeTableCommand({TableName:table}));
 if(!description.Table.KeySchema.some(k=>k.AttributeName==='collection'&&k.KeyType==='HASH')||!description.Table.KeySchema.some(k=>k.AttributeName==='recordKey'&&k.KeyType==='RANGE'))throw new Error('Target table schema mismatch');
 const client=DynamoDBDocumentClient.from(raw,{marshallOptions:{removeUndefinedValues:true}});
 const existing=await client.send(new ScanCommand({TableName:table,Limit:1,ConsistentRead:true}));
 if(existing.Items?.length)throw new Error('Target table must be empty; existing data preserved');
 for(const collection of payload.collections){
  for(let i=0;i<collection.items.length;i+=25){
   let pending=collection.items.slice(i,i+25).map(Item=>({PutRequest:{Item}}));
   for(let attempt=0;pending.length;attempt++){
    if(attempt>=8)throw new Error('Write retries exceeded; partial import needs inspection');
    const result=await client.send(new BatchWriteCommand({RequestItems:{[table]:pending}}));
    pending=result.UnprocessedItems?.[table]||[];
    if(pending.length)await new Promise(r=>setTimeout(r,Math.min(10000,200*2**attempt)+Math.random()*100));
   }
  }
  let cursor,count=0;
  do{const result=await client.send(new QueryCommand({TableName:table,KeyConditionExpression:'#c=:c',ExpressionAttributeNames:{'#c':'collection'},ExpressionAttributeValues:{':c':collection.name},Select:'COUNT',ConsistentRead:true,ExclusiveStartKey:cursor}));count+=result.Count||0;cursor=result.LastEvaluatedKey;}while(cursor);
  if(count!==collection.count)throw new Error('Verification mismatch: '+collection.name);
  console.log('VERIFIED '+collection.name+' '+count);
 }
 await client.send(new PutCommand({TableName:table,Item:{collection:'_migration',recordKey:'IMPORT',status:'COMPLETE',tables:payload.collections.length,rows:total,sourceSnapshotAt:payload.createdAt,completedAt:new Date().toISOString()}}));
 console.log(JSON.stringify({status:'COLLECTION_IMPORT_COMPLETE',tables:payload.collections.length,rows:total,apiMigrationComplete:false}));
}
main().catch(e=>{console.error('Import stopped:',e.name,e.message);process.exitCode=1});
