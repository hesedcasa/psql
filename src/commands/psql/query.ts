import type {ApiResult} from '@hesed/plugin-lib'

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
    '<%= config.bin %> <%= command.id %> "UPDATE users SET email = \'user@email.com\' WHERE id = 999" --json',
    '<%= config.bin %> <%= command.id %> "DELETE FROM sessions" -p prod --skip-confirmation',
  ]
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
    'skip-confirmation': Flags.boolean({
      default: false,
      description: 'Skip confirmation prompt for destructive operations',
    }),
    toon: Flags.boolean({default: false, description: 'Output in toon format'}),
  }

  public async run(): Promise<ApiResult> {
    const {args, flags} = await this.parse(PostgresQuery)

    const format = this.jsonEnabled() ? 'json' : flags.toon ? 'toon' : 'table'
    const result = await executeQuery(this.config, args.query, flags.profile, format, flags['skip-confirmation'])
    await closeConnections()

    if (result.success) {
      // Notices (warnings, row counts) go to stderr so machine-readable formats
      // leave stdout as clean, parseable data.
      if (result.notices) this.logToStderr(result.notices)
      if (!this.jsonEnabled()) this.log(result.result ?? '')
      return {data: this.jsonEnabled() ? this.parseJsonOutput(result.result) : result, success: true}
    }

    if (result.requiresConfirmation) {
      this.log(
        `${result.message ?? 'Destructive operation requires confirmation.'}\nRe-run with --skip-confirmation to proceed.`,
      )
      return {data: result, success: false}
    }

    this.error(result.error ?? 'Query failed')
  }
}
