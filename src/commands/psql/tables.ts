import {Command, Flags} from '@oclif/core'

import {closeConnections, getPgConfig, listTables, setConfigDir} from '../../psql/index.js'

export default class PostgresTables extends Command {
  static override description = 'List all tables in the current PostgreSQL database'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --profile local',
  ]
  static override flags = {
    profile: Flags.string({description: 'Database profile name from config', required: false}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(PostgresTables)

    setConfigDir(this.config.configDir)
    let profile: string
    try {
      profile = flags.profile ?? (await getPgConfig()).defaultProfile
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : String(error))
    }

    const result = await listTables(profile)
    await closeConnections()

    if (result.success) {
      this.logJson(result.tables)
    } else {
      this.error(result.error ?? 'Failed to list tables')
    }
  }
}
