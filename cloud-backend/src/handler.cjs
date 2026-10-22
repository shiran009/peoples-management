const { createAuthService } = require('./auth/service.cjs');
function createHandler(service, people, checkStorage, master, onboarding, employees, reporting) {
  let storageReadyUntil=0,storageCheck;
  return async function handler(event) {
    const method = event.requestContext?.http?.method;
    const path = event.rawPath;
    const response = (statusCode, body) => ({ statusCode,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: statusCode === 204 ? '' : JSON.stringify(body) });
    if (method === 'OPTIONS') return response(204);
    try {
      if (method === 'GET' && path === '/health') {
        if(checkStorage && Date.now()>=storageReadyUntil){
          storageCheck ||= Promise.resolve().then(checkStorage);
          try { await storageCheck; storageReadyUntil=Date.now()+30000; }
          catch(error){ console.error('HR storage check failed',{name:error.name}); return response(503,{status:'unavailable',message:'HR data store unavailable',migrationComplete:false}); }
          finally { storageCheck=null; }
        }
        return response(200,{status:'ok',service:'HR DynamoDB auth pilot',migrationComplete:false,...(checkStorage?{storageReady:true}:{})});
      }
      if (people && method === 'GET') {
        const authorization=event.headers?.authorization || event.headers?.Authorization;
        if (path === '/api/users' || path === '/api/users/') return response(200, await people.users(authorization,event.queryStringParameters||{}));
        if (path === '/api/users/me') return response(200, await people.detail(authorization));
        const userMatch=/^\/api\/users\/([^/]+)$/.exec(path);
        if(userMatch){let id;try{id=decodeURIComponent(userMatch[1])}catch{return response(400,{success:false,message:'Invalid record ID'})}return response(200,await people.detail(authorization,id))}
        if(path==='/api/onboarding'||path==='/api/onboarding/')return response(200,await people.onboarding(authorization));
        const profileMatch=/^\/api\/onboarding\/([^/]+)$/.exec(path);
        if(profileMatch){let id;try{id=decodeURIComponent(profileMatch[1])}catch{return response(400,{success:false,message:'Invalid record ID'})}return response(200,await people.onboarding(authorization,id))}
        if (path === '/api/invites' || path === '/api/invites/') return response(200, await people.invites(authorization));
        if (path === '/api/organization/dashboard') return response(200, await people.dashboard(authorization));
      }
      let body = {};
      if (['POST','PUT','PATCH'].includes(method)) {
        const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '{}';
        if (Buffer.byteLength(raw) > 16384) return response(413, { success: false, message: 'Request too large' });
        try { body = JSON.parse(raw); } catch { return response(400, { success: false, message: 'Invalid JSON' }); }
      }
      const authorization = event.headers?.authorization || event.headers?.Authorization;
      if(reporting){const result=await require('./reporting-hierarchy/routes.cjs').routeReporting(reporting,method,path,authorization,event.queryStringParameters||{});if(result)return response(result.status,result.body)}
      if(employees){const result=await require('./employee-information/routes.cjs').routeEmployee(employees,method,path,authorization);if(result)return response(result.status,result.body)}
      if(onboarding&&method==='POST'&&['/api/onboarding','/api/onboarding/'].includes(path))return response(201,await onboarding.submit(authorization,body));
      if(master){
        const result=await require('./master-data/routes.cjs').routeMaster(master,method,path,authorization,body);
        if(result)return response(result.status,result.body);
      }
      if (!['/api/auth/login', '/api/auth/me', '/api/auth/change-password'].includes(path)) {
        return response(501, { success: false, code: 'MODULE_NOT_MIGRATED',
          message: 'This HR module has not been migrated to DynamoDB yet' });
      }

      if (method === 'POST' && path === '/api/auth/login') return response(200, await service.login(body));
      if (method === 'GET' && path === '/api/auth/me') return response(200, await service.me(authorization));
      if (method === 'POST' && path === '/api/auth/change-password') return response(200, await service.changePassword(authorization, body));
      return response(405, { success: false, message: 'Method not allowed' });
    } catch (error) {
      if (!error.status) console.error('Cloud auth request failed', { name: error.name, requestId: event.requestContext?.requestId });
      return response(error.status || 500, { success: false, message: error.status ? error.message : 'Internal server error' });
    }
  };
}
let handler;
exports.handler = (event) => {
  if (!handler) {
    const auth=createAuthService(require('./auth/repository.cjs').createRepository(), process.env.JWT_SECRET);
    const repository=require('./data/repository.cjs').createDataRepository();
    const people=require('./people/service.cjs').createPeopleService(repository,auth);
    const master=process.env.MASTER_DATA_ENABLED==='true'?require('./master-data/service.cjs').createMasterService(require('./master-data/repository.cjs').createMasterRepository(),auth):undefined;
    const onboarding=process.env.ONBOARDING_WRITES_ENABLED==='true'?require('./onboarding/service.cjs').createOnboardingService(require('./onboarding/repository.cjs').createOnboardingRepository(),auth):undefined;
    const employees=process.env.EMPLOYEE_READS_ENABLED==='true'?require('./employee-information/service.cjs').createEmployeeService(require('./employee-information/repository.cjs').createEmployeeRepository(),auth):undefined;
    const reporting=process.env.REPORTING_READS_ENABLED==='true'?require('./reporting-hierarchy/service.cjs').createReportingService(require('./reporting-hierarchy/repository.cjs').createReportingRepository(),auth):undefined;
    handler=createHandler(auth,people,()=>repository.probe(),master,onboarding,employees,reporting);
  }
  return handler(event);
};
exports.createHandler = createHandler;
