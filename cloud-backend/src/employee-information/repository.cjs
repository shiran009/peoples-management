const {createReadRepository}=require('../shared/read-repository.cjs');
const {readTables}=require('./config.cjs');
function createEmployeeRepository(control,options){return createReadRepository(readTables,control,options)}
module.exports={createEmployeeRepository};
