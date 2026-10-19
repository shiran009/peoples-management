require('dotenv').config({quiet:true});
const http=require('node:http');
const {handler}=require('./handler.cjs');
const origins=['http://localhost:5174','http://127.0.0.1:5174'];
function createLocalServer(handle=handler){
 return http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  if(origin&&!origins.includes(origin)){res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({success:false,message:'Browser origin is not allowed'}));return}
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization,Cache-Control,Pragma,Expires');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
  let body='';
  try{
   for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384){res.writeHead(413);res.end();return}}
   const url=new URL(req.url,'http://localhost');
   const result=await handle({rawPath:url.pathname,queryStringParameters:Object.fromEntries(url.searchParams),headers:req.headers,body,requestContext:{http:{method:req.method}}});
   res.writeHead(result.statusCode,result.headers);res.end(result.body);
  }catch{res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({success:false,message:'Local cloud-backend configuration error'}))}
 });
}
if(require.main===module){
 const port=Number(process.env.PORT||3002);
 createLocalServer().listen(port,'127.0.0.1',()=>console.log('HR DynamoDB development backend: http://localhost:'+port));
}
module.exports={createLocalServer};