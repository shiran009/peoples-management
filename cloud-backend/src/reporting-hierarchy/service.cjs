const {HttpError}=require('../auth/service.cjs');
const active=e=>e.status==='Active'&&(e.isActive==null||Boolean(e.isActive));
const name=p=>[p?.firstName,p?.lastName].filter(Boolean).join(' ').trim();
const clean=({_hrRecordKey,_hrRevision,...row})=>row;
function createReportingService(repo,auth){
 async function context(token){const actor=await auth.authenticate(token);if(actor.mustChangePassword)throw new HttpError(403,'Change your temporary password before using the system');await repo.ready();return actor}
 async function directory(){const [employees,personal,users]=await Promise.all(['employee_information_employees','employee_information_personal_details','users'].map(t=>repo.list(t)));const selected=employees.filter(active);const nodes=selected.map(e=>{const p=personal.find(p=>p.employeeId===e.id);return {id:e.id,employeeNo:e.employeeNo??e.employeeNumber??'',name:name(p)||name(e)||e.callingName||'Employee',organizationalRank:e.organizationalRank,designation:e.designation,department:e.department,avatar:e.avatar,status:e.status,reportingManagerId:e.reportingManagerId||null,reportingEffectiveFrom:e.reportingEffectiveFrom,email:users.find(u=>u.id===e.userId)?.email,directReportsCount:selected.filter(r=>r.reportingManagerId===e.id).length,hasChildren:selected.some(r=>r.reportingManagerId===e.id)}}).sort((a,b)=>a.name.localeCompare(b.name));return {employees,selected,nodes,users}}
 return {async read(token,entity,params={}){
  const actor=await context(token);const admin=['ADMIN','SUPER_ADMIN'].includes(actor.role);
  if(['audit','unassigned'].includes(entity)&&!admin)throw new HttpError(403,'Admin access required');
  if(entity==='levels'){const rows=await repo.list('reporting_hierarchy_levels');return {success:true,data:Object.fromEntries(rows.map(r=>[r.depth,r.name]))}}
  const {employees,nodes}=await directory();const own=employees.find(e=>e.userId===actor.id);
  const safe=node=>admin?node:Object.fromEntries(Object.entries(node).filter(([k])=>k!=='email'));
  let data;
  if(entity==='employees'){const search=String(params.search||'').toLocaleLowerCase('en');data=nodes.filter(e=>e.id!==params.excludeId&&(!search||[e.name,e.employeeNo,e.designation,e.department].some(v=>String(v||'').toLocaleLowerCase('en').includes(search)))).map(({email,status,organizationalRank,reportingEffectiveFrom,...n})=>n)}
  else if(entity==='tree'){data=(params.mode==='all'?nodes:nodes.filter(e=>params.parentId?e.reportingManagerId===params.parentId:!e.reportingManagerId||!nodes.some(p=>p.id===e.reportingManagerId))).map(safe)}
  else if(entity==='my-node')data=own?.id||null;
  else if(entity==='my-manager'){const manager=nodes.find(n=>n.id===own?.reportingManagerId);const work=manager?(await repo.list('employee_information_workstation_details',{field:'employeeId',value:manager.id}))[0]:null;data=manager?{id:manager.id,employeeNo:manager.employeeNo,fullName:manager.name,designation:manager.designation||work?.designationId||'Staff',department:manager.department||work?.departmentId||'',avatar:manager.avatar,status:manager.status,personalEmail:manager.email,mobilePhone:''}:null}
  else if(entity==='upward-path'){const path=[];const seen=new Set();let id=params.employeeId;while(id&&!seen.has(id)){const node=nodes.find(n=>n.id===id);if(!node)break;seen.add(id);path.push(id);id=node.reportingManagerId}data=path.reverse()}
  else if(entity==='unassigned')data=nodes.filter(n=>!n.reportingManagerId&&n.organizationalRank!=='OWNER').map(({email,reportingManagerId,reportingEffectiveFrom,hasChildren,...n})=>n);
  else if(entity==='audit'){const rows=await repo.list('reporting_hierarchy_audit');data=rows.map(r=>({...clean(r),employeeName:nodes.find(n=>n.id===r.employee_id)?.name||null,previousManagerName:nodes.find(n=>n.id===r.previous_manager_id)?.name||null,newManagerName:nodes.find(n=>n.id===r.new_manager_id)?.name||null})).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,100)}
  else throw new HttpError(404,'Reporting view not found');
  return {success:true,data};
 }};
}
module.exports={createReportingService};
