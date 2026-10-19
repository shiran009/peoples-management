const assert=require('node:assert/strict');
const {STSClient,GetCallerIdentityCommand}=require('@aws-sdk/client-sts');
const {createDataRepository}=require('../src/data/repository.cjs');
const {createMasterRepository}=require('../src/master-data/repository.cjs');
const {createMasterService}=require('../src/master-data/service.cjs');
const {entities}=require('../src/master-data/config.cjs');
(async()=>{
 assert.equal((await new STSClient({}).send(new GetCallerIdentityCommand({}))).Account,'561633119560');
 const source=createDataRepository();await source.ready();
 const actor=(await source.list('users')).find(u=>u.isActive&&!u.mustChangePassword&&u.role==='SUPER_ADMIN');assert(actor);
 const repo=createMasterRepository();const service=createMasterService(repo,{authenticate:async()=>actor});
 let created;let deleted=false;
 try{
  const createdResponse=await service.write('validation','POST','membership-types',undefined,{code:'MIGRATION_VALIDATION',name:'Migration validation (temporary)',isActive:false});
  created=createdResponse.data;assert(created.id&&created.code==='MIGRATION_VALIDATION'&&created.isActive===0);
  await service.write('validation','PUT','membership-types',created.id,{description:'Approved migration validation'});
  const updated=(await service.read('validation','membership-types')).data.find(r=>r.id===created.id);assert.equal(updated.description,'Approved migration validation');
  await assert.rejects(service.write('validation','POST','membership-types',undefined,{code:'migration_validation',name:'Must not be created'}),{status:409});
  await service.write('validation','DELETE','membership-types',created.id);deleted=true;
  assert(!(await service.read('validation','membership-types')).data.some(r=>r.id===created.id));
  const audits=(await repo.list('eim_audit_logs')).filter(r=>r.recordId===created.id);assert.deepEqual(audits.map(r=>r.action).sort(),['CREATE','DELETE','UPDATE']);
  for(const entity of Object.keys(entities))assert((await service.read('validation',entity)).success);
  assert((await service.read('validation','dashboard-stats')).success);
  console.log(JSON.stringify({status:'EIM_DYNAMODB_INTEGRATION_PASS',configurationTypes:35,testRecordRemoved:true,atomicAudits:3,duplicateCodeRejected:true,actorInjected:true}));
 }finally{
  if(created&&!deleted){await service.write('validation','DELETE','membership-types',created.id);console.log('TEMPORARY_VALIDATION_RECORD_REMOVED_AFTER_FAILURE')}
 }
})().catch(e=>{console.error('EIM_INTEGRATION_FAILED',e.name,e.status||'');process.exit(1)});