import {Args, Command, Flags} from '@oclif/core'

import {closeConnections, explainQuery} from '../../psql/index.js'

export default class PostgresExplain extends Command {
  static override args = {
    query: Args.string({description: 'SQL query to explain', required: true}),
  }
  static override description = 'Show the execution plan for a PostgreSQL query'
  static override examples = [
    '<%= config.bin %> <%= command.id %> "SELECT * FROM users WHERE id = 1"',
    '<%= config.bin %> <%= command.id %> "SELECT * FROM orders JOIN users ON orders.user_id = users.id" --format json',
  ]
  static override flags = {
    format: Flags.string({
      default: 'table',
      description: 'Output format',
      options: ['table', 'json', 'toon'],
    }),
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(PostgresExplain)

    const result = await explainQuery(this.config, args.query, flags.profile, flags.format as 'json' | 'table' | 'toon')
    await closeConnections()

    if (result.success) {
      this.log(result.result ?? '')
    } else {
      this.error(result.error ?? 'Failed to explain query')
    }
  }
}
