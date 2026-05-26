import {Command} from '@oclif/core'

import {readConfig} from '../../../config.js'

export default class AuthList extends Command {
  static override args = {}
  static override description = 'List PostgreSQL auth profiles'
  static override enableJsonFlag = true
  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    const config = await readConfig(this.config.configDir, this.log.bind(this))
    if (!config) {
      this.log('No profiles found. Run pg auth add first.')
      return
    }

    const profiles = config.profiles ?? {}
    const defaultProfile = config.defaultProfile ?? ''

    if (Object.keys(profiles).length === 0) {
      this.log('No profiles found.')
      return
    }

    for (const [name, profile] of Object.entries(profiles)) {
      const isDefault = name === defaultProfile ? ' (default)' : ''
      this.log(`${name}${isDefault}: ${profile.user}@${profile.host}:${profile.port ?? 5432}/${profile.database}`)
    }
  }
}
