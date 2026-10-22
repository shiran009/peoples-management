const {HttpError}=require('../auth/service.cjs');
async function routeEmployee(service,method,path,token){
 const base='/api/employee_information/audit';if(method!=='GET'||!path.startsWith(base))return;
 if(path===base||path===base+'/')return {status:200,body:await service.directory(token)};
 if(path===base+'/me')return {status:200,body:await service.detail(token)};
 const detail=new RegExp('^'+base+'/([^/]+)$').exec(path);
 const match=detail;if(!match)return;
 let id;try{id=decodeURIComponent(match[1])}catch{throw new HttpError(400,'Invalid employee ID')}
 if(['profile-requests','profile-picture','attachments','check-no','transition-log'].includes(id))return;
 return {status:200,body:await service.detail(token,id)};
}
module.exports={routeEmployee};
