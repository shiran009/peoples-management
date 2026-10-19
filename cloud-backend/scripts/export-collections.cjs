const fs=require('node:fs');const crypto=require('node:crypto');const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../../backend/.env'),quiet:true});
const mysql=require('mysql2/promise');
async function main(){
 const output=process.argv[2];if(!output)throw new Error('Provide a private export path');
 let c;const collections=[];
 try{
 c=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 const [tables]=await c.query('SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type=? ORDER BY TABLE_NAME',['BASE TABLE']);
 for(const {name}of tables){
  const [keys]=await c.query('SELECT COLUMN_NAME AS name FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name=? AND constraint_name=? ORDER BY ORDINAL_POSITION',[name,'PRIMARY']);
  const [rows]=await c.query('SELECT * FROM '+mysql.escapeId(name));
  const seen=new Set();
  const items=rows.map((row,index)=>{
   const key=keys.length?JSON.stringify(keys.map(k=>row[k.name])):crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex')+'#'+index;
   const item={collection:name,recordKey:key,data:row};
   if(seen.has(key)||Buffer.byteLength(key)>1024)throw new Error('Invalid/duplicate key in '+name);seen.add(key);
   if(Buffer.byteLength(JSON.stringify(item))>350000)throw new Error('Oversize item in '+name+'; split large documents before migration');
   return item;
  });
  collections.push({name,primaryKey:keys.map(k=>k.name),count:rows.length,items});
 }
 await c.commit();
 }finally{if(c)await c.end()}
 const data={format:'hr-collections-v1',createdAt:new Date().toISOString(),collections};
 fs.writeFileSync(output,JSON.stringify(data),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({collections:collections.length,rows:collections.reduce((n,t)=>n+t.count,0),exported:true}));
}
main().catch(e=>{console.error('Export stopped:',e.code||e.name);process.exitCode=1});
