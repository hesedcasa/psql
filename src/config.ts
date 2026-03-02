import {default as fs} from 'fs-extra'
import {default as path} from 'node:path'

export interface DatabaseProfile {
  database: string
  host: string
  password: string
  port: number
  ssl?: boolean
  user: string
}

export interface PgJsonConfig {
  defaultProfile: string
  profiles: Record<string, DatabaseProfile>
}

export async function readConfig(configDir: string, log: (message: string) => void): Promise<PgJsonConfig | undefined> {
  const configPath = path.join(configDir, 'pg-config.json')

  try {
    return await fs.readJSON(configPath)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.toLowerCase().includes('no such file or directory')) {
      log('Missing connection config')
    } else {
      log(msg)
    }

    return undefined
  }
}
