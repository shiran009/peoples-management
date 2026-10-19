const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDataRepository,collections}=require('../src/data/repository.cjs');

test('separate-table reads paginate, preserve row fields, and remove migration key',async()=>{
 const calls=[];const client={send:async command=>{calls.push(command);return calls.length===1?{Items:[{_hrRecordKey:'["b"]',id:'b',name:'B'}],LastEvaluatedKey:{_hrRecordKey:'["b"]'}}:{Items:[{_hrRecordKey:'["a"]',id:'a',name:'A'}]}}};
 const repo=createDataRepository('control',{prefix:'peopleshr-',client});
 assert.deepEqual(await repo.list('users'),[{id:'a',name:'A'},{id:'b',name:'B'}]);
 assert(calls.every(c=>c.constructor.name==='ScanCommand'&&c.input.TableName==='peopleshr-users'&&c.input.ConsistentRead));
 assert.deepEqual(calls[1].input.ExclusiveStartKey,{_hrRecordKey:'["b"]'});
 await assert.rejects(repo.list('PixeltechContacts'),/Unsupported collection/);
 assert.equal(calls.length,2);
});

test('separate-table readiness refuses incomplete or mismatched manifests without falling back',async()=>{
 let marker={status:'COMPLETE',prefix:'peopleshr-',tables:collections.map(source=>({source,table:'peopleshr-'+source}))};const calls=[];
 const repo=createDataRepository('control',{prefix:'peopleshr-',client:{send:async c=>{calls.push(c);return {Item:marker}}}});
 await repo.ready();assert.equal(calls[0].input.Key.recordKey,'SEPARATE_TABLES_V1');
 marker.tables.pop();await assert.rejects(repo.ready(),{status:503});
 marker={status:'COMPLETE',prefix:'other-',tables:[]};await assert.rejects(repo.ready(),{status:503});
 await assert.rejects(createDataRepository('control',{prefix:'peopleshr-',client:{send:async()=>({})}}).ready(),{status:503});
});

test('legacy collection mode still queries the existing table and unwraps rows',async()=>{
 const calls=[];const repo=createDataRepository('original',{prefix:'',client:{send:async c=>{calls.push(c);return c.constructor.name==='GetCommand'?{Item:{status:'COMPLETE'}}:{Items:[{collection:'users',recordKey:'u',data:{id:'u'}}]}}}});
 await repo.ready();assert.equal(calls[0].input.Key.recordKey,'IMPORT');
 assert.deepEqual(await repo.list('users'),[{id:'u'}]);assert.equal(calls[1].constructor.name,'QueryCommand');assert.equal(calls[1].input.TableName,'original');
 assert.throws(()=>createDataRepository('control',{prefix:'Pixeltech'}),/Unsupported HR table prefix/);
});
test('storage probe checks every allowed table using keys only and bounded reads',async()=>{
 const calls=[];const marker={status:'COMPLETE',prefix:'peopleshr-',tables:collections.map(source=>({source,table:'peopleshr-'+source}))};
 const repo=createDataRepository('control',{prefix:'peopleshr-',client:{send:async c=>{calls.push(c);return {Item:marker}}}});
 await repo.probe();assert.equal(calls.length,collections.length+1);
 assert(calls.slice(1).every(c=>c.input.Limit===1&&c.input.ProjectionExpression==='#key'&&c.input.ExpressionAttributeNames['#key']==='_hrRecordKey'));
});

test('health reports storage failure without disclosing details and caches successful probes',async()=>{
 const {createHandler}=require('../src/handler.cjs');const event={rawPath:'/health',requestContext:{http:{method:'GET'}}};let calls=0;
 const handler=createHandler({},null,async()=>{calls++});
 const result=await handler(event);assert.equal(result.statusCode,200);assert.equal(JSON.parse(result.body).storageReady,true);await handler(event);assert.equal(calls,1);
 const failing=createHandler({},null,async()=>{throw new Error('private diagnostic')});
 const failure=await failing(event);assert.equal(failure.statusCode,503);assert(!failure.body.includes('private diagnostic'));
});
