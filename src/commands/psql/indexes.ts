import {Args, Command, Flags} from '@oclif/core'

import {closeConnections, showIndexes} from '../../psql/index.js'

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

    const result = await showIndexes(this.config, args.table, flags.profile, flags.format as 'json' | 'table' | 'toon')
    await closeConnections()

    if (result.success) {
      this.log(result.result ?? '')
    } else {
      this.error(result.error ?? 'Failed to show indexes')
    }
  }
}
