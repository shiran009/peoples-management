const {HttpError}=require('../auth/service.cjs');
async function routeReporting(service,method,path,token,params={}){
 if(method!=='GET')return;
 const match=/^\/api\/reporting-hierarchy\/(employees|tree|my-node|my-manager|unassigned|levels|audit|upward-path(?:\/[^/]+)?)$/.exec(path);if(!match)return;
 let [entity,id]=match[1].split('/');if(entity==='upward-path'){if(!id)return;try{id=decodeURIComponent(id)}catch{throw new HttpError(400,'Invalid employee ID')}params={...params,employeeId:id}}
 return {status:200,body:await service.read(token,entity,params)};
}
module.exports={routeReporting};
