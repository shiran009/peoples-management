const {createHash}=require('node:crypto');
const fields=require('./profile-fields.json');
function row(table,value){if(!value)return null;const columns=fields[table]||[];return Object.fromEntries(columns.filter(k=>Object.hasOwn(value,k)).map(k=>[k,structuredClone(value[k])]))}
function json(value,fallback={}){try{const result=typeof value==='string'?JSON.parse(value):value;return result&&typeof result==='object'?structuredClone(result):fallback}catch{return fallback}}
function identifiedContacts(contacts){return contacts.map(v=>({...v,id:v.id||'legacy-'+createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,24)}))}
function buildProfile(employee,data,user,invite,self){
 const id=employee?.id;const one=t=>row(t,data[t]?.find(r=>r.employeeId===id));
 const many=t=>(data[t]||[]).filter(r=>r.employeeId===id).map(r=>row(t,r));
 const onboarding=data.onboarding_profiles?.find(p=>p.candidateId===user?.id);
 let personal=one('employee_information_personal_details');
 let contact=one('employee_information_contact_details');
 let bank=many('employee_information_bank_details');
 const workstation=one('employee_information_workstation_details');
 if(contact)for(const field of ['permanent','working','official','residential'])contact[field]=json(contact[field],null);
 if(onboarding||(self&&invite)){
  const name=user?.name||'';personal||={};
  const defaults={firstName:onboarding?.firstName||name.split(' ')[0],lastName:onboarding?.lastName||name.split(' ').slice(1).join(' '),fullName:onboarding?[onboarding.firstName,onboarding.lastName].join(' '):name,dob:onboarding?.dateOfBirth,gender:onboarding?.gender,nationality:onboarding?.nationality};
  for(const [k,v]of Object.entries(defaults))if(!personal[k]&&v!==undefined)personal[k]=v;
  contact||={permanent:null,working:null,official:null,residential:null};
  if(!contact.permanent&&onboarding)contact.permanent={address:onboarding.addressLine1||'',city:onboarding.city||'',postalCode:onboarding.postalCode||''};
  contact.residential||={};
  if(!contact.residential.emergencyContacts?.length&&onboarding?.emergencyContactName)contact.residential.emergencyContacts=[{name:onboarding.emergencyContactName,relationship:onboarding.emergencyContactRelation,primaryPhone:onboarding.emergencyContactPhone}];
  if(!bank.length&&onboarding?.bankName)bank=[{bankName:onboarding.bankName,accountHolderName:onboarding.accountHolderName,accountNo:onboarding.accountNumber,accountType:onboarding.accountType,currency:onboarding.currency}];
 }
 if(contact?.residential?.emergencyContacts)contact.residential.emergencyContacts=identifiedContacts(contact.residential.emergencyContacts);
 if(workstation){workstation.supervisorId=employee.reportingManagerId||null;if(workstation.functionalRole!==undefined)workstation.functionalRoleId=workstation.functionalRole;if(self)workstation.designationName=data.designations?.find(d=>d.id===workstation.designationId)?.name||null}
 const extras=json(data.employee_profile_extras?.find(r=>r.employeeId===id)?.data);
 const otherDetails=Object.fromEntries(['dependents','qualifications','workExperience','expertise','memberships'].filter(k=>Array.isArray(extras[k])).map(k=>[k,extras[k]]));
 const employment=employee?{dateJoined:employee.dateJoined,probationStatus:employee.probationStatus,permanentEffectiveDate:employee.permanentEffectiveDate}:{};
 const employmentType=row('employment_types',data.employment_types?.find(t=>t.id===employee?.employmentTypeId));
 if(self){const manager=data.employee_information_employees?.find(e=>e.id===employee?.reportingManagerId);Object.assign(employment,{designation:employee?.designation||invite?.designation,department:employee?.department||invite?.team,employmentType:employmentType?.name||employee?.employmentType||invite?.employmentType,organizationalRank:employee?.organizationalRank,reportingManager:manager?[manager.firstName,manager.lastName].filter(Boolean).join(' '):employee?.organizationalRank==='OWNER'?'Owner / no manager':'Not assigned'});employment.dateJoined||=invite?.joinedDate}
 const assignment=(data.attendance_roster_assignments||[]).filter(r=>r.employeeId===id&&r.status==='Active').sort((a,b)=>String(b.effectiveStartDate||'').localeCompare(String(a.effectiveStartDate||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
 return {...(row('employee_information_employees',employee)||{}),otherDetails,payrollDetails:{dependents:otherDetails.dependents||[]},isActive:Boolean(employee?.isActive),timeAndAttendanceActive:Boolean(employee?.timeAndAttendanceActive),payrollActive:Boolean(employee?.payrollActive),employmentType,personalDetails:personal,employmentDetails:employment,workstationDetails:workstation,contactDetails:contact,resignationDetails:one('employee_information_resignation_details'),salaryHistories:many('employee_salary_histories'),bankDetails:bank,attendance:assignment?{rosterGroupId:assignment.groupId??assignment.rosterGroupId,effectiveStartDate:assignment.effectiveStartDate}:null,...(self?{user:user?{id:user.id,name:user.name,email:user.email,role:user.role}:null}:{})};
}
module.exports={buildProfile,row};
