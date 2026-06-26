import type {ApiResult} from '@hesed/plugin-lib'

import {Flags} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import {DatabaseListData} from '../../psql/database.js'
import {closeConnections, listDatabases} from '../../psql/index.js'

export default class PostgresDatabases extends BaseCommand {
  static override description = 'List all databases accessible on the PostgreSQL server'
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> -p staging']
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Database profile name from config', required: false}),
  }

  public async run(): Promise<ApiResult> {
    const {flags} = await this.parse(PostgresDatabases)

    const result = await listDatabases(this.config, flags.profile)
    await closeConnections()

    if (result.success) {
      this.log(result.data?.result ?? '')

      delete (result.data as DatabaseListData).result

      return result
    }

    this.error(String(result.error ?? 'Failed to list databases'))
  }
}
