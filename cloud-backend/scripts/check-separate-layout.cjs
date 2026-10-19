const assert=require('node:assert/strict');
const {createDataRepository}=require('../src/data/repository.cjs');
const {createPeopleService}=require('../src/people/service.cjs');
(async()=>{
 const separate=createDataRepository(process.env.DATA_TABLE,{prefix:'peopleshr-'});
 const original=createDataRepository(process.env.DATA_TABLE,{prefix:''});
 await separate.ready();await original.ready();
 const users=await separate.list('users');
 assert.equal(users.length,29);
 const actor=users.find(u=>u.isActive&&['SUPER_ADMIN','ADMIN'].includes(u.role)&&!u.mustChangePassword);assert(actor);
 const auth={authenticate:async()=>actor};
 const fixedDate=()=>new Date('2026-10-20T00:00:00Z');
 const before=createPeopleService(original,auth,fixedDate),after=createPeopleService(separate,auth,fixedDate);
 assert.deepEqual(await after.dashboard('test'),await before.dashboard('test'));
 assert.deepEqual(await after.users('test',{limit:100}),await before.users('test',{limit:100}));
 assert.deepEqual(await after.invites('test'),await before.invites('test'));
 console.log(JSON.stringify({status:'SEPARATE_TABLE_SERVICE_PARITY_PASS',users:users.length,employees:(await after.dashboard('test')).data.totalEmployees,checked:['dashboard','people','invites'],actorInjected:true}));
})().catch(e=>{console.error(e.name,"PARITY_CHECK_FAILED");process.exit(1)});