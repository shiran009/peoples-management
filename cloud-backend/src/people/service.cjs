const {HttpError}=require('../auth/service.cjs');
const active=e=>e.status==='Active'&&(e.isActive==null||Boolean(e.isActive));
const nameOf=e=>[e?.firstName,e?.lastName].filter(Boolean).join(' ').trim();
function scopeFor(actor,employees){
 const own=employees.find(e=>e.userId===actor.id&&e.active);
 const admin=['SUPER_ADMIN','ADMIN'].includes(actor.role);
 const executive=['OWNER','CEO'].includes(own?.organizationalRank);
 const team=new Set();const seen=new Set(own?[own.id]:[]);const queue=own?[own.id]:[];
 for(let i=0;i<queue.length;i++)for(const e of employees){if(e.active&&e.managerId===queue[i]&&!seen.has(e.id)){seen.add(e.id);team.add(e.id);queue.push(e.id)}}
 return {admin,executive,own,team,visible:new Set(admin||executive?employees.filter(e=>e.active).map(e=>e.id):[own?.id,...team].filter(Boolean))};
}
function createPeopleService(repository,auth,now=()=>new Date()){
 async function load(authorization,collections){
  const actor=await auth.authenticate(authorization);
  if(actor.mustChangePassword)throw new HttpError(403,'Change your temporary password before using the system');
  await repository.ready();
  const names=[...new Set(['employee_information_employees','employee_information_personal_details','eim_structures','designations',...collections])];
  const data=Object.fromEntries(await Promise.all(names.map(async n=>[n,await repository.list(n)])));
  const raw=data.employee_information_employees;
  const personal=new Map(data.employee_information_personal_details.map(p=>[p.employeeId,p]));
  const structures=new Map(data.eim_structures.map(d=>[d.id,d.name]));
  const titles=new Map(data.designations.map(d=>[d.id,d.name]));
  const employees=raw.map(e=>{
   const manager=raw.find(m=>m.id===e.reportingManagerId);
   return {id:e.id,userId:e.userId,managerId:e.reportingManagerId,organizationalRank:e.organizationalRank,
    name:nameOf(personal.get(e.id))||nameOf(e)||e.callingName||e.employeeNumber,
    employeeNumber:e.employeeNumber??e.employeeNo??'',department:structures.get(e.departmentId)||e.department||'',designation:titles.get(e.designationId)||e.designation||'',
    managerName:nameOf(personal.get(manager?.id))||nameOf(manager)||manager?.callingName||'',active:active(e)};
  });
  return {actor,data,employees,scope:scopeFor(actor,employees)};
 }
 return {
  async users(authorization,params={}){
   const {data,scope}=await load(authorization,['users','onboarding_profiles','invites','contracts','documents']);
   const page=Math.max(1,parseInt(params.page,10)||1),limit=Math.max(1,Math.min(500,parseInt(params.limit,10)||50));
   const role=params.role;
   const users=data.users.filter(u=>(!role||u.role===role)&&(scope.admin||data.employee_information_employees.some(e=>e.userId===u.id&&scope.visible.has(e.id)))).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
   const latest=rows=>rows.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(a.id).localeCompare(String(b.id)))[0];
   const result=users.slice((page-1)*limit,page*limit).map(u=>{
    const employee=data.employee_information_employees.find(e=>e.userId===u.id);
    const p=scope.admin?data.onboarding_profiles.find(p=>p.candidateId===u.id):null;
    const invitation=latest(data.invites.filter(i=>i.email===u.email));const contract=latest(data.contracts.filter(c=>c.candidateId===u.id));
    const profileFields=['firstName','lastName','city','dateOfBirth','gender','nationality','addressLine1','addressLine2','postalCode','phoneNumber','alternatePhone','linkedIn','emergencyContactName','emergencyContactRelation','emergencyContactPhone','bankName','accountHolderName','accountNumber','accountType','currency'];
    return {id:u.id,name:u.name,email:u.email,role:u.role,isActive:Boolean(u.isActive),createdAt:u.createdAt,
     onboardingProfile:p?.firstName?Object.fromEntries(profileFields.map(k=>[k,p[k]??null])):null,
     receivedInvite:invitation?.designation?{designation:invitation.designation,team:invitation.team,employmentType:invitation.employmentType,joinedDate:invitation.joinedDate}:null,
     contract:contract?{status:contract.status}:null,documents:data.documents.filter(d=>d.candidateId===u.id).map(d=>({status:d.status})),
     employee:employee?{id:employee.id,designation:employee.designation,department:employee.department,employmentType:employee.employmentType,organizationalRank:employee.organizationalRank,dateJoined:employee.dateJoined,employeeStatus:employee.employeeStatus,employeeNo:employee.employeeNo}:null};
   });
   return {success:true,data:result,meta:{total:users.length,page,limit,totalPages:Math.ceil(users.length/limit)}};
  },
  async detail(authorization,userId='me'){
   const {actor,data,scope}=await load(authorization,['users','onboarding_profiles','invites','contracts']);
   if(userId!=='me'&&!scope.admin)throw new HttpError(403,'Admin access required');
   const id=userId==='me'?actor.id:userId;const u=data.users.find(u=>u.id===id);if(!u)throw new HttpError(404,'User not found');
   const fields=['firstName','lastName','city','dateOfBirth','gender','nationality','addressLine1','addressLine2','postalCode','phoneNumber','alternatePhone','linkedIn','emergencyContactName','emergencyContactRelation','emergencyContactPhone','bankName','accountHolderName','accountNumber','accountType','currency','createdAt','updatedAt'];
   const p=data.onboarding_profiles.find(p=>p.candidateId===id);
   const latest=rows=>rows.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(a.id).localeCompare(String(b.id)))[0];
   const invitation=latest(data.invites.filter(i=>i.email===u.email));const contract=latest(data.contracts.filter(c=>c.candidateId===id));
   return {success:true,data:{id:u.id,name:u.name,email:u.email,role:u.role,isActive:Boolean(u.isActive),createdAt:u.createdAt,onboardingProfile:p?.firstName?Object.fromEntries(fields.map(k=>[k,p[k]??null])):null,receivedInvite:invitation?.designation?{designation:invitation.designation,team:invitation.team,employmentType:invitation.employmentType,joinedDate:invitation.joinedDate,status:invitation.status}:null,contract:contract?{id:contract.id,title:contract.title,status:contract.status,signedAt:contract.signedAt}:null}};
  },
  async onboarding(authorization,candidateId){
   const {actor,data,scope}=await load(authorization,['users','onboarding_profiles']);const target=candidateId||actor.id;
   if(target!==actor.id&&!scope.admin)throw new HttpError(403,'Access denied');
   const profile=data.onboarding_profiles.find(p=>p.candidateId===target);
   if(!profile){if(candidateId)throw new HttpError(404,'Onboarding profile not found');return {success:true,data:null}}
   const fields=['id','candidateId','firstName','lastName','dateOfBirth','gender','nationality','addressLine1','addressLine2','city','postalCode','phoneNumber','alternatePhone','linkedIn','emergencyContactName','emergencyContactRelation','emergencyContactPhone','bankName','accountHolderName','accountNumber','accountType','currency','createdAt','updatedAt'];
   const result=Object.fromEntries(fields.map(k=>[k,profile[k]??null]));
   if(candidateId){const u=data.users.find(u=>u.id===target);result.candidate=u?{id:u.id,name:u.name,email:u.email,role:u.role}:null}
   return {success:true,data:result};
  },
  async invites(authorization){
   const {scope,data}=await load(authorization,['invites','users']);if(!scope.admin)throw new HttpError(403,'Admin access required');
   const fields=['id','email','name','role','employmentType','designation','team','joinedDate','expiresAt','invitedById','status','createdAt','updatedAt'];
   return {success:true,data:data.invites.map(i=>({...Object.fromEntries(fields.map(k=>[k,i[k]??null])),invitedBy:(()=>{const u=data.users.find(u=>u.id===i.invitedById);return u?{id:u.id,name:u.name,email:u.email}:null})()}))};
  },
  async dashboard(authorization){
   const {actor,data,scope,employees}=await load(authorization,['attendance_records','leave_applications','attendance_exceptions','attendance_roster_assignments','attendance_roster_groups','attendance_roster_group_shifts','attendance_shifts','hr_performance_reviews']);
   const visible=employees.filter(e=>scope.visible.has(e.id));const ids=new Set(visible.map(e=>e.id)),users=new Set(visible.map(e=>e.userId));
   const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now());
   const attendance=data.attendance_records.filter(a=>ids.has(a.employeeId)&&String(a.date).slice(0,10)===date);
   const leaves=data.leave_applications.filter(l=>users.has(l.applicantId));
   const onLeave=new Set(leaves.filter(l=>l.status==='APPROVED'&&String(l.startDate).slice(0,10)<=date&&String(l.endDate).slice(0,10)>=date).map(l=>l.applicantId));
   const present=new Set(attendance.filter(a=>a.inTime||['Present','Late'].includes(a.status)).map(a=>a.employeeId));
   const assigned=new Map();
   for(const a of data.attendance_roster_assignments.filter(a=>ids.has(a.employeeId)&&a.status==='Active'&&String(a.effectiveStartDate).slice(0,10)<=date&&(!a.effectiveEndDate||String(a.effectiveEndDate).slice(0,10)>=date))){
    const g=data.attendance_roster_groups.find(g=>g.id===(a.groupId??a.rosterGroupId));if(!g)continue;
    const shifts=data.attendance_roster_group_shifts.filter(s=>(s.groupId===g.id||s.rosterGroupId===g.id)&&s.isDefault);
    const types=assigned.get(a.employeeId)||new Set();
    for(const s of shifts)types.add(data.attendance_shifts.find(t=>t.id===s.shiftId)?.shiftType||'');
    if(!shifts.length)types.add('');assigned.set(a.employeeId,types);
   }
   const reviews=data.hr_performance_reviews.filter(r=>ids.has(r.employee_id)).map(r=>typeof r.data==='string'?JSON.parse(r.data):r.data);
   const recorded=new Set([...present,...visible.filter(e=>onLeave.has(e.userId)).map(e=>e.id),...attendance.filter(a=>a.status==='Absent').map(a=>a.employeeId)]);
   const shiftCount=re=>[...assigned.values()].reduce((n,types)=>n+[...types].filter(t=>re.test(t)).length,0);
   return {success:true,data:{scope:scope.admin||scope.executive?'Company':scope.team.size?'My team':'My profile',rank:scope.own?.organizationalRank||null,
    employees:visible.map(({userId,...e})=>e),totalEmployees:visible.length,departments:[...new Set(visible.map(e=>e.department))].map(name=>({name,total:visible.filter(e=>e.department===name).length})),directReports:visible.filter(e=>e.managerId===scope.own?.id).length,
    attendance:{date,present:present.size,absent:attendance.filter(a=>a.status==='Absent').length,late:attendance.filter(a=>a.isLate).length,onLeave:onLeave.size,notRecorded:Math.max(0,visible.length-recorded.size),pendingExceptions:data.attendance_exceptions.filter(e=>ids.has(e.employeeId)&&String(e.status).toUpperCase()==='PENDING').length,
     roster:{total:visible.length,day:shiftCount(/day/i),late:shiftCount(/late/i),night:shiftCount(/night/i),rotational:shiftCount(/rotat/i),unassigned:visible.length-assigned.size}},
    leave:{pending:leaves.filter(l=>String(l.status).startsWith('PENDING')).length,pendingForMe:leaves.filter(l=>String(l.status).startsWith('PENDING')&&l.approverId===actor.id).length,onLeaveToday:onLeave.size},
    performance:{reviews:reviews.length,open:reviews.filter(r=>!r.closedAt).length,closed:reviews.filter(r=>r.closedAt).length,cycles:new Set(reviews.filter(r=>!r.closedAt).map(r=>r.cycleId)).size},own:visible.find(e=>e.id===scope.own?.id)||null}};
  }
 };
}
module.exports={createPeopleService,scopeFor};
