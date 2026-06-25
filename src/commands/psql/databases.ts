import {Command, Flags} from '@oclif/core'

import {closeConnections, listDatabases} from '../../psql/index.js'

export default class PostgresDatabases extends Command {
  static override description = 'List all databases accessible on the PostgreSQL server'
  static override enableJsonFlag = true
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> -p staging']
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
  }

  public override jsonEnabled(): boolean {
    return true
  }

  public async run(): Promise<string[]> {
    const {flags} = await this.parse(PostgresDatabases)

    const result = await listDatabases(this.config, flags.profile)
    await closeConnections()

    if (result.success) {
      return result.databases ?? []
    }

    this.error(result.error ?? 'Failed to list databases')
  }
}
