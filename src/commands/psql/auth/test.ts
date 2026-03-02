import {Command, Flags} from '@oclif/core'
import {action} from '@oclif/core/ux'

import type {ConnectionTestResult} from '../../../psql/index.js'

import {readConfig} from '../../../config.js'
import {testDirectConnection} from '../../../psql/index.js'

export default class AuthTest extends Command {
  static override args = {}
  static override description = 'Test PostgreSQL database connection'
  static override enableJsonFlag = true
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --profile staging',
  ]
  static override flags = {
    profile: Flags.string({description: 'Profile name to test', required: false}),
  }

  public async run(): Promise<ConnectionTestResult> {
    const {flags} = await this.parse(AuthTest)
    const config = await readConfig(this.config.configDir, this.log.bind(this))
    if (!config) {
      return {
        error: 'Missing connection config',
        success: false,
      }
    }

    const profile = config.profiles[flags.profile ?? config.defaultProfile]
    if (!profile) {
      this.error(`Profile "${flags.profile}" not found. Available: ${Object.keys(config.profiles).join(', ')}`)
    }

    action.start('Testing connection')
    const result = await testDirectConnection(profile)

    if (result.success) {
      action.stop('✓ successful')
      this.log('Successfully connected to PostgreSQL')
    } else {
      action.stop('✗ failed')
      this.error('Failed to connect to PostgreSQL.')
    }

    return result
  }
}
