const {randomUUID}=require('node:crypto');
const {HttpError}=require('../auth/service.cjs');
const {entities,writable}=require('./config.cjs');
const publicRow=({_hrRecordKey,_hrRevision,...row})=>row;
const fold=value=>String(value).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('en').trimEnd();
const dateValid=v=>{const date=new Date(v+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===v};
function validate(body,create){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'Invalid input');
 const result={};const lengths={code:50,name:255,description:8000};
 for(const [field,value]of Object.entries(body)){
  if(Object.hasOwn(lengths,field)){if(value===null&&field!=='name'){result[field]=null;continue}if(typeof value!=='string'||value.length>lengths[field]||(field==='name'&&!value.trim()))throw new HttpError(400,'Invalid '+field);result[field]=field==='description'?value:value.trim()}
  else if(field==='isActive'){if(![true,false,0,1].includes(value))throw new HttpError(400,'Invalid isActive');result[field]=value?1:0}
  else if(['effectiveStartDate','effectiveEndDate'].includes(field)){if(value!==null&&value!==''&&(typeof value!=='string'||!dateValid(value)))throw new HttpError(400,'Invalid '+field);result[field]=value||null}
  else throw new HttpError(400,'Unsupported field: '+field);
 }
 if(create&&!result.name)throw new HttpError(400,'Name is required');
 return result;
}
function createMasterService(repo,auth,now=()=>new Date()){
 async function actorFor(token,admin=false){const actor=await auth.authenticate(token);if(actor.mustChangePassword)throw new HttpError(403,'Change your temporary password before using the system');if(admin&&!['ADMIN','SUPER_ADMIN'].includes(actor.role))throw new HttpError(403,'Admin access required');await repo.ready();return actor}
 return {
  async read(token,entity){
   await actorFor(token,entity==='audit-logs');
   if(entity==='dashboard-stats'){
    const pairs=[['companies','eim_companies'],['locations','eim_locations'],['departments','eim_structures'],['designations','designations'],['salaryGrades','eim_salary_grades'],['employmentTypes','employment_types']];
    return {success:true,data:Object.fromEntries(await Promise.all(pairs.map(async([k,t])=>[k,(await repo.list(t)).filter(r=>Boolean(r.isActive)).length])))};
   }
   const table=entities[entity];if(!table)throw new HttpError(404,'Master data type not found');
   const rows=(await repo.list(table)).map(publicRow);
   rows.sort((a,b)=>entity==='audit-logs'?String(b.changedAt).localeCompare(String(a.changedAt)):entity==='hierarchy-config'?Number(a.level_order)-Number(b.level_order):entity==='corporate-titles'?Number(a.level)-Number(b.level)||String(a.name).localeCompare(String(b.name)):entity==='dynamic-fields'?String(a.applicableModule).localeCompare(String(b.applicableModule))||Number(a.displayOrder)-Number(b.displayOrder):String(a.name).localeCompare(String(b.name)));
   return {success:true,data:entity==='audit-logs'?rows.slice(0,100):rows};
  },
  async write(token,method,entity,id,body){
   const actor=await actorFor(token,true);
   if(!writable.has(entity))throw new HttpError(501,'This master data write workflow has not been migrated yet');
   if(!['POST','PUT','DELETE'].includes(method))throw new HttpError(405,'Method not allowed');
   if(method!=='POST'&&(typeof id!=='string'||!id||id.length>128))throw new HttpError(400,'Invalid record ID');
   const patch=method==='DELETE'?null:validate(body,method==='POST');
   const table=entities[entity];
   return repo.withWriteLock(async lease=>{
    const previous=method==='POST'?null:await repo.get(table,id);
    if(method!=='POST'&&!previous)throw new HttpError(404,'Record not found');
    const timestamp=now().toISOString().replace('T',' ').slice(0,19);
    const next=method==='DELETE'?null:{...(previous?publicRow(previous):{id:randomUUID(),isActive:1,code:null,description:null,effectiveStartDate:null,effectiveEndDate:null,createdAt:timestamp,createdBy:actor.id}),...patch,updatedAt:timestamp,updatedBy:actor.id};
    if(next?.effectiveStartDate&&next?.effectiveEndDate&&next.effectiveStartDate>next.effectiveEndDate)throw new HttpError(400,'End date must not precede start date');
    if(next?.code!==null&&next?.code!==undefined){const rows=await repo.list(table);if(rows.some(r=>r.id!==next.id&&r.code!==null&&r.code!==undefined&&fold(r.code)===fold(next.code)))throw new HttpError(409,'Code is already in use')}
    const audit={id:randomUUID(),module:'eim_admin',recordType:table,recordId:next?.id??previous.id,action:method==='POST'?'CREATE':method==='PUT'?'UPDATE':'DELETE',previousValue:previous?JSON.stringify(publicRow(previous)):null,newValue:next?JSON.stringify(next):null,changedBy:actor.id,changedAt:timestamp};
    await repo.commit(lease,table,previous,next,audit);
    return {success:true,message:method==='DELETE'?'Record deleted':'Record saved',...(next?{data:next}:{})};
   });
  }
 };
}
module.exports={createMasterService,validate};