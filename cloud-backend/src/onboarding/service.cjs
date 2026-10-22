const {randomUUID}=require('node:crypto');
const {HttpError}=require('../auth/service.cjs');
const {validate,publicProfile}=require('./validation.cjs');
function createOnboardingService(repo,auth,now=()=>new Date()){
 return {async submit(token,body){
  const actor=await auth.authenticate(token);
  if(actor.mustChangePassword)throw new HttpError(403,'Change your temporary password before using the system');
  const values=validate(body);await repo.ready();
  return repo.withWriteLock(async lease=>{
   const profiles=await repo.profiles(actor.id);
   if(profiles.length>1)throw new HttpError(409,'Multiple onboarding profiles exist; contact HR');
   const previous=profiles[0];const timestamp=now().toISOString().replace('T',' ').slice(0,19);
   const next={...(previous||{}),...values,id:previous?.id||randomUUID(),candidateId:actor.id,createdAt:previous?.createdAt||timestamp,updatedAt:timestamp};
   await repo.save(lease,previous,next);
   return {success:true,message:'Onboarding details saved successfully',data:publicProfile(next)};
  });
 }};
}
module.exports={createOnboardingService};
