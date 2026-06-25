import {Command, Flags} from '@oclif/core'

import {closeConnections, listTables} from '../../psql/index.js'

export default class PostgresTables extends Command {
  static override description = 'List all tables in the current PostgreSQL database'
  static override enableJsonFlag = true
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> -p local']
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
  }

  public override jsonEnabled(): boolean {
    return true
  }

  public async run(): Promise<string[]> {
    const {flags} = await this.parse(PostgresTables)

    const result = await listTables(this.config, flags.profile)
    await closeConnections()

    if (result.success) {
      return result.tables ?? []
    }

    this.error(result.error ?? 'Failed to list tables')
  }
}
