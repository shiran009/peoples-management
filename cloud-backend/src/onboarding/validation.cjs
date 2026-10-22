const {HttpError}=require('../auth/service.cjs');
// Field limits preserve the SQL form contract while refusing server-owned attributes.
const fields={firstName:[1,50],lastName:[1,50],dateOfBirth:[10,10],gender:[1,50],nationality:[0,100],addressLine1:[1,200],addressLine2:[0,255],city:[1,100],postalCode:[0,20],phoneNumber:[7,20],alternatePhone:[0,50],linkedIn:[0,2048],emergencyContactName:[1,255],emergencyContactRelation:[1,100],emergencyContactPhone:[7,50],bankName:[1,255],accountHolderName:[1,255],accountNumber:[4,100],accountType:[1,100],currency:[1,10]};
const optional=new Set(['nationality','addressLine2','postalCode','alternatePhone','linkedIn']);
function validate(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'Invalid onboarding details');
 for(const key of Object.keys(body))if(!Object.hasOwn(fields,key))throw new HttpError(400,'Unsupported onboarding field: '+key);
 const result={};
 for(const [field,[min,max]]of Object.entries(fields)){
  const value=body[field]??(field==='accountType'?'SAVINGS':field==='currency'?'USD':undefined);
  if(value===undefined&&optional.has(field))continue;
  if(typeof value!=='string'||value.trim().length<min||value.length>max)throw new HttpError(400,'Invalid '+field);
  result[field]=value.trim();
 }
 const date=new Date(result.dateOfBirth+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(result.dateOfBirth)||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==result.dateOfBirth)throw new HttpError(400,'Enter a valid date of birth');
 if(!['Father','Mother','Other'].includes(result.emergencyContactRelation))throw new HttpError(400,'Invalid emergency contact relationship');
 if(!['SAVINGS','CHECKING'].includes(result.accountType))throw new HttpError(400,'Invalid account type');
 if(result.linkedIn){let url;try{url=new URL(result.linkedIn)}catch{throw new HttpError(400,'Invalid profile URL')}if(!['http:','https:'].includes(url.protocol))throw new HttpError(400,'Invalid profile URL')}
 return result;
}
function publicProfile(row){return Object.fromEntries(['id','candidateId',...Object.keys(fields),'createdAt','updatedAt'].filter(k=>row[k]!==undefined).map(k=>[k,row[k]]))}
module.exports={validate,publicProfile};
