import type {ApiResult} from '@hesed/plugin-lib'

import {Args, Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {TableStructureData} from '../../psql/database.js'
import {closeConnections, describeTable} from '../../psql/index.js'

export default class PostgresDescribeTable extends BaseCommand {
  static override args = {
    table: Args.string({description: 'Table name to describe', required: true}),
  }
  static override description = 'Describe the structure of a PostgreSQL table'
  static override examples = [
    '<%= config.bin %> <%= command.id %> users --toon',
    '<%= config.bin %> <%= command.id %> orders -p prod',
  ]
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
    toon: Flags.boolean({default: false, description: 'Output in toon format'}),
  }

  public async run(): Promise<ApiResult> {
    const {args, flags} = await this.parse(PostgresDescribeTable)

    const format = flags.toon ? 'toon' : flags.json ? 'json' : 'table'
    const result = await describeTable(this.config, args.table, flags.profile, format)
    await closeConnections()

    if (result.success) {
      this.log(result.data?.result ?? '')

      delete (result.data as TableStructureData).result

      return result
    }

    this.error(String(result.error ?? 'Failed to describe table'))
  }
}
