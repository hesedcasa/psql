export type {PgJsonConfig} from '../config.js'
export type {ConnectionTestResult} from './database.js'
export {
  closeConnections,
  describeTable,
  executeQuery,
  explainQuery,
  getPgConfig,
  listDatabases,
  listTables,
  setConfigDir,
  showIndexes,
  testDirectConnection,
} from './postgres-client.js'
