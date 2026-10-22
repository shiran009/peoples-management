const {createReadRepository}=require('../shared/read-repository.cjs');
const readTables=['employee_information_employees','employee_information_personal_details','users','employee_information_workstation_details','reporting_hierarchy_levels','reporting_hierarchy_audit'];
function createReportingRepository(control,options){return createReadRepository(readTables,control,options)}
module.exports={createReportingRepository,readTables};
