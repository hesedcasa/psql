import {Args, Command} from '@oclif/core'
import {default as fs} from 'fs-extra'
import {default as path} from 'node:path'

import type {PgJsonConfig} from '../../../psql/index.js'

import {readConfig} from '../../../config.js'

export default class AuthProfile extends Command {
  static override args = {
    profile: Args.string({description: 'Profile name to set as default', required: true}),
  }

  static override description = 'Set the default PostgreSQL auth profile'
  static override enableJsonFlag = true
  static override examples = ['<%= config.bin %> <%= command.id %> myprofile']

  public async run(): Promise<void> {
    const {args} = await this.parse(AuthProfile)
    const config = await readConfig(this.config.configDir, this.log.bind(this))
    if (!config) {
      this.error('No config found. Run pg auth add first.')
      return
    }

    if (!config.profiles?.[args.profile]) {
      this.error(`Profile "${args.profile}" not found. Available: ${Object.keys(config.profiles).join(', ')}`)
      return
    }

    config.defaultProfile = args.profile

    const configPath = path.join(this.config.configDir, 'pg-config.json')
    await fs.writeJSON(configPath, config as PgJsonConfig, {mode: 0o600})
    this.log(`Default profile set to "${args.profile}".`)
  }
}
