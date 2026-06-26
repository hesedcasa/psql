import type {ApiResult} from '@hesed/plugin-lib'

import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {closeConnections, showIndexes} from '../../psql/index.js'

export default class PostgresIndexes extends BaseCommand {
  static override args = {
    table: Args.string({description: 'Table name to show indexes for', required: true}),
  }
  static override description = 'Show indexes for a PostgreSQL table'
  static override examples = [
    '<%= config.bin %> <%= command.id %> users',
    '<%= config.bin %> <%= command.id %> orders --json -p prod',
  ]
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
    toon: Flags.boolean({default: false, description: 'Output in toon format'}),
  }

  public async run(): Promise<ApiResult> {
    const {args, flags} = await this.parse(PostgresIndexes)

    const format = this.jsonEnabled() ? 'json' : flags.toon ? 'toon' : 'table'
    const result = await showIndexes(this.config, args.table, flags.profile, format)
    await closeConnections()

    if (result.success) {
      if (!this.jsonEnabled()) this.log(result.result ?? '')
      return {data: result, success: true}
    }

    this.error(result.error ?? 'Failed to show indexes')
  }
}
