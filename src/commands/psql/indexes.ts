import {Args, Command, Flags} from '@oclif/core'

import {closeConnections, getPgConfig, setConfigDir, showIndexes} from '../../psql/index.js'

export default class PostgresIndexes extends Command {
  static override args = {
    table: Args.string({description: 'Table name to show indexes for', required: true}),
  }
  static override description = 'Show indexes for a PostgreSQL table'
  static override examples = [
    '<%= config.bin %> <%= command.id %> users',
    '<%= config.bin %> <%= command.id %> orders --format json --profile prod',
  ]
  static override flags = {
    format: Flags.string({
      default: 'table',
      description: 'Output format',
      options: ['table', 'json', 'toon'],
    }),
    profile: Flags.string({description: 'Database profile name from config', required: false}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(PostgresIndexes)

    setConfigDir(this.config.configDir)
    let profile: string
    try {
      profile = flags.profile ?? (await getPgConfig()).defaultProfile
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : String(error))
    }

    const result = await showIndexes(profile, args.table, flags.format as 'json' | 'table' | 'toon')
    await closeConnections()

    if (result.success) {
      this.log(result.result ?? '')
    } else {
      this.error(result.error ?? 'Failed to show indexes')
    }
  }
}
