import {Args, Command} from '@oclif/core'
import {default as fs} from 'fs-extra'
import {default as path} from 'node:path'

import type {PgJsonConfig} from '../../../psql/index.js'

import {readConfig} from '../../../config.js'

export default class AuthDelete extends Command {
  static override args = {
    profile: Args.string({description: 'Profile name to delete', required: true}),
  }

  static override description = 'Delete a PostgreSQL auth profile'
  static override enableJsonFlag = true
  static override examples = ['<%= config.bin %> <%= command.id %> myprofile']

  public async run(): Promise<void> {
    const {args} = await this.parse(AuthDelete)
    const config = await readConfig(this.config.configDir, this.log.bind(this))
    if (!config) {
      this.error('No config found. Run pg auth add first.')
      return
    }

    if (!config.profiles?.[args.profile]) {
      this.error(`Profile "${args.profile}" not found. Available: ${Object.keys(config.profiles).join(', ')}`)
      return
    }

    delete config.profiles[args.profile]

    if (config.defaultProfile === args.profile) {
      config.defaultProfile = Object.keys(config.profiles)[0] ?? ''
    }

    const configPath = path.join(this.config.configDir, 'pg-config.json')
    await fs.writeJSON(configPath, config as PgJsonConfig, {mode: 0o600})
    this.log(`Profile "${args.profile}" deleted.`)
  }
}
