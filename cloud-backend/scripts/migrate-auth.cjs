require('dotenv').config({path:require('node:path').join(__dirname,'../../backend/.env'),quiet:true});
const mysql=require('mysql2/promise');
async function main(){
 const write=process.argv.includes('--write');let c;let users,permissions,employees;
 try{const source=new URL(process.env.DATABASE_URL);c=await mysql.createConnection({host:source.hostname==='localhost'?'127.0.0.1':source.hostname,port:Number(source.port||3306),user:decodeURIComponent(source.username),password:decodeURIComponent(source.password),database:decodeURIComponent(source.pathname.slice(1)),connectTimeout:15000,dateStrings:true});
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
 await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 [users]=await c.query('SELECT id,email,name,password,role,isActive,mustChangePassword,updatedAt FROM users');
 [permissions]=await c.query('SELECT userId,moduleId,moduleAccess,canView,canCreate,canEdit,canDelete,canApprove,canExport,dataScope FROM user_module_permissions');
 [employees]=await c.query('SELECT id,userId,reportingManagerId,organizationalRank,status,isActive FROM employee_information_employees');await c.commit();
 }finally{if(c)await c.end()}
 const emails=new Set();const records=users.map(user=>{
 const email=user.email.trim().toLowerCase();if(emails.has(email))throw new Error('Duplicate normalized email');emails.add(email);
 const active=e=>e.status==='Active'&&(e.isActive==null||e.isActive);
 const own=employees.find(e=>e.userId===user.id&&active(e));
 return {...user,isActive:Boolean(user.isActive),mustChangePassword:Boolean(user.mustChangePassword),
 updatedAt:user.updatedAt instanceof Date?user.updatedAt.toISOString():user.updatedAt,
 identity:{employeeId:own?.id||null,organizationalRank:own?.organizationalRank||null,isOwner:own?.organizationalRank==='OWNER',isExecutive:['OWNER','CEO'].includes(own?.organizationalRank),isManager:Boolean(own&&employees.some(e=>e.id!==own.id&&e.reportingManagerId===own.id&&active(e)))},
 permissions:permissions.filter(p=>p.userId===user.id).map(({userId,...p})=>{for(const k of ['moduleAccess','canView','canCreate','canEdit','canDelete','canApprove','canExport'])p[k]=Boolean(p[k]);p.dataScope||='OWN';return p})};});
 for(const record of records)if(Buffer.byteLength(JSON.stringify(record))>350000)throw new Error('Account exceeds safe item size');
 console.log(JSON.stringify({mode:write?'write':'dry-run',users:records.length,permissions:permissions.length,employees:employees.length}));
 const exportIndex=process.argv.indexOf('--export');
 if(exportIndex!==-1){
  if(write)throw new Error('Do not combine --export and --write');
  const output=process.argv[exportIndex+1];if(!output)throw new Error('Provide an export file path');
  require('node:fs').writeFileSync(output,JSON.stringify({format:'hr-auth-v1',records}),{flag:'wx',mode:0o600});
  console.log('AUTH_EXPORT_CREATED: private account data; keep out of Git');return;
 }
 if(!write)return;
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
 console.log('AUTH_IMPORT_COMPLETE: Password hashes preserved; other HR data remains in MySQL.');
}
main().catch(e=>{console.error('Migration stopped:',e.code||e.name,e.message.replace(/mysql:\/\/\S+/g,'[redacted]'));process.exitCode=1});
