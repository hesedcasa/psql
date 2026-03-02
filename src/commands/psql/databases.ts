import {Command, Flags} from '@oclif/core'

import {closeConnections, getPgConfig, listDatabases, setConfigDir} from '../../psql/index.js'

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

    setConfigDir(this.config.configDir)
    let profile: string
    try {
      profile = flags.profile ?? (await getPgConfig()).defaultProfile
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : String(error))
    }

    const result = await listDatabases(profile)
    await closeConnections()

    if (result.success) {
      this.logJson(result.databases)
    } else {
      this.error(result.error ?? 'Failed to list databases')
    }
  }
}
