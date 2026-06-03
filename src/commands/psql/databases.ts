import {Command, Flags} from '@oclif/core'

import {closeConnections, listDatabases} from '../../psql/index.js'

export default class PostgresDatabases extends Command {
  static override description = 'List all databases accessible on the PostgreSQL server'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --profile staging',
  ]
  static override flags = {
    profile: Flags.string({description: 'Database profile name from config', required: false}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(PostgresDatabases)

    const result = await listDatabases(this.config, flags.profile)
    await closeConnections()

    if (result.success) {
      this.logJson(result.databases)
    } else {
      this.error(result.error ?? 'Failed to list databases')
    }
  }
}
