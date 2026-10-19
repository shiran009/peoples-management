const {HttpError}=require('../auth/service.cjs');
function matchMasterRoute(path){return /^\/api\/eim\/([a-z-]+)(?:\/([^/]+))?\/?$/.exec(path)}
async function routeMaster(service,method,path,authorization,body){
 const match=matchMasterRoute(path);if(!match)return null;
 const [,entity,encodedId]=match;let id;
 try{id=encodedId?decodeURIComponent(encodedId):undefined}catch{throw new HttpError(400,'Invalid record ID')}
 if(method==='GET'&&!id)return {status:200,body:await service.read(authorization,entity)};
 if((method==='POST'&&!id)||(['PUT','DELETE'].includes(method)&&id))return {status:method==='POST'?201:200,body:await service.write(authorization,method,entity,id,body)};
 throw new HttpError(405,'Method not allowed');
}
module.exports={routeMaster,matchMasterRoute};