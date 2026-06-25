import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {closeConnections, executeQuery} from '../../psql/index.js'

export default class PostgresQuery extends BaseCommand {
  static override args = {
    query: Args.string({description: 'SQL query to execute', required: true}),
  }
  static override description = 'Execute a SQL query against a PostgreSQL database'
  static override examples = [
    '<%= config.bin %> <%= command.id %> "SELECT * FROM users LIMIT 10"',
    '<%= config.bin %> <%= command.id %> "UPDATE users SET email = \'user@email.com\' WHERE id = 999" --format json',
    '<%= config.bin %> <%= command.id %> "DELETE FROM sessions" -p prod --skip-confirmation',
  ]
  static override flags = {
    format: Flags.string({
      default: 'table',
      description: 'Output format',
      options: ['table', 'json', 'csv', 'toon'],
    }),
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
    'skip-confirmation': Flags.boolean({
      default: false,
      description: 'Skip confirmation prompt for destructive operations',
    }),
  }

  public async run(): Promise<unknown> {
    const {args, flags} = await this.parse(PostgresQuery)

    const result = await executeQuery(
      this.config,
      args.query,
      flags.profile,
      flags.format as 'csv' | 'json' | 'table' | 'toon',
      flags['skip-confirmation'],
    )
    await closeConnections()

    if (result.success) {
      // Notices (warnings, row counts) go to stderr so machine-readable formats
      // leave stdout as clean, parseable data.
      if (result.notices) this.logToStderr(result.notices)
      if (this.jsonEnabled()) return this.parseJsonOutput(result.result)
      this.log(result.result ?? '')
      return result
    }

    if (result.requiresConfirmation) {
      this.log(
        `${result.message ?? 'Destructive operation requires confirmation.'}\nRe-run with --skip-confirmation to proceed.`,
      )
      return result
    }

    this.error(result.error ?? 'Query failed')
  }
}
