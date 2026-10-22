const {HttpError}=require('../auth/service.cjs');
const {scopeFor}=require('../people/service.cjs');
const {buildProfile}=require('./profile.cjs');
function createEmployeeService(repo,auth){
 async function context(token){const actor=await auth.authenticate(token);if(actor.mustChangePassword)throw new HttpError(403,'Change your temporary password before using the system');await repo.ready();const employees=await repo.list('employee_information_employees');const scope=scopeFor(actor,employees.map(e=>({...e,managerId:e.reportingManagerId,active:e.status==='Active'&&(e.isActive==null||Boolean(e.isActive))})));return {actor,employees,scope}}
 async function load(table,employeeId){return repo.list(table,{field:'employeeId',value:employeeId})}
 return {
  async directory(token){const {employees,scope}=await context(token);const [personal,workstation,types,designations,users]=await Promise.all(['employee_information_personal_details','employee_information_workstation_details','employment_types','designations','users'].map(t=>repo.list(t)));const data=employees.filter(e=>scope.visible.has(e.id)).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(e=>{const p=personal.find(p=>p.employeeId===e.id);const w=workstation.find(w=>w.employeeId===e.id);const basic={id:e.id,userId:e.userId,employeeNo:e.employeeNo,isActive:Boolean(e.isActive),departmentId:w?.departmentId||e.departmentId||null,department:e.department,designation:e.designation,organizationalRank:e.organizationalRank,personalDetails:p?{firstName:p.firstName,lastName:p.lastName}:null};if(!scope.admin&&!scope.executive)return basic;const type=types.find(t=>t.id===e.employmentTypeId);const des=designations.find(d=>d.id===w?.designationId);const u=users.find(u=>u.id===e.userId);return {...basic,...Object.fromEntries(['barcodeNo','payrollNo','timeAndAttendanceActive','payrollActive','employeeStatus','employeeGroup','createdAt','updatedAt'].map(k=>[k,['timeAndAttendanceActive','payrollActive'].includes(k)?Boolean(e[k]):e[k]])),personalDetails:p?Object.fromEntries(['firstName','lastName','gender','maritalStatus','dob','nic','nationality','bloodGroup','religion'].map(k=>[k,p[k]])):null,employmentDetails:e.dateJoined?{dateJoined:e.dateJoined,probationStatus:e.probationStatus,permanentEffectiveDate:e.permanentEffectiveDate}:null,employmentType:type?{id:type.id,name:type.name}:null,workstationDetails:w?{...Object.fromEntries(['id','companyId','locationId','departmentId','designationId','sectionId','divisionId'].map(k=>[k,w[k]])),Designation:des?{id:des.id,name:des.name}:null}:null,user:u?{name:u.name,email:u.email,role:u.role}:null}});return {success:true,data}},
  async detail(token,target='me'){
   const {actor,employees,scope}=await context(token);const self=target==='me';const employee=self?employees.find(e=>e.userId===actor.id):employees.find(e=>e.id===target);
   if(!self&&!scope.admin&&!scope.visible.has(target)){const permissions=await repo.list('user_module_permissions',{field:'userId',value:actor.id});const delegated=permissions.some(p=>p.userId===actor.id&&p.moduleId==='employee_information'&&p.moduleAccess&&p.canView&&['ALL','ORGANIZATION'].includes(p.dataScope));if(!delegated)throw new HttpError(403,'Private employee details are available only to authorized accounts')}
   if(!employee&&!self)throw new HttpError(404,'Employee not found');
   const data={employee_information_employees:employees};
   if(employee)await Promise.all(['employee_information_personal_details','employee_information_workstation_details','employee_information_contact_details','employee_information_resignation_details','employee_salary_histories','employee_information_bank_details','employee_profile_extras','attendance_roster_assignments'].map(async t=>{data[t]=await load(t,employee.id)}));
   const userId=self?actor.id:employee.userId;
   const users=await repo.list('users');const user=users.find(u=>u.id===userId)||(self?{id:actor.id,name:actor.name,email:actor.email,role:actor.role}:null);
   data.onboarding_profiles=userId?await repo.list('onboarding_profiles',{field:'candidateId',value:userId}):[];
   data.employment_types=await repo.list('employment_types');data.designations=await repo.list('designations');
   const invites=self?(await repo.list('invites')).filter(i=>i.email===user.email).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))):[];
   return {success:true,data:buildProfile(employee,data,user,invites[0],self)};
  }
 };
}
module.exports={createEmployeeService};
