import {createAuthAddCommand, type FieldDef} from '@hesed/plugin-lib'

import {closeConnections, testDirectConnection} from '../../../psql/index.js'

const fields: FieldDef[] = [
  {description: 'PostgreSQL host', name: 'host', type: 'string'},
  {default: 5432, description: 'PostgreSQL port', name: 'port', type: 'number'},
  {char: 'u', description: 'Username', name: 'user', type: 'string'},
  {description: 'Password', name: 'password', type: 'string'},
  {char: 'd', description: 'Database name', name: 'database', type: 'string'},
  {default: false, description: 'Use SSL', name: 'ssl', required: false, type: 'boolean'},
]

export default createAuthAddCommand({
  clearClients: closeConnections,
  fields,
  serviceName: 'PostgreSQL',
  testConnection: testDirectConnection,
})
