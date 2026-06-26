import type {ApiResult} from '@hesed/plugin-lib'

import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {closeConnections, explainQuery} from '../../psql/index.js'

export default class PostgresExplain extends BaseCommand {
  static override args = {
    query: Args.string({description: 'SQL query to explain', required: true}),
  }
  static override description = 'Show the execution plan for a PostgreSQL query'
  static override examples = [
    '<%= config.bin %> <%= command.id %> "SELECT * FROM users WHERE id = 1"',
    '<%= config.bin %> <%= command.id %> "SELECT * FROM orders JOIN users ON orders.user_id = users.id" --json',
  ]
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
    toon: Flags.boolean({default: false, description: 'Output in toon format'}),
  }

  public async run(): Promise<ApiResult> {
    const {args, flags} = await this.parse(PostgresExplain)

    const format = this.jsonEnabled() ? 'json' : flags.toon ? 'toon' : 'table'
    const result = await explainQuery(this.config, args.query, flags.profile, format)
    await closeConnections()

    if (result.success) {
      if (!this.jsonEnabled()) this.log(result.result ?? '')
      return {data: result, success: true}
    }

    this.error(result.error ?? 'Failed to explain query')
  }
}
