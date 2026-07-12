import type {ClientConfig} from 'pg'

interface SafetyConfig {
  blacklistedOperations: string[]
  defaultLimit: number
  maxConcurrentQueries?: number
  queryQueueTimeoutMs?: number
  requireConfirmationFor: string[]
}

export interface DatabaseProfile {
  database: string
  host: string
  maxConcurrentQueries?: number
  password: string
  port: number
  queryQueueTimeoutMs?: number
  ssl?: boolean
  user: string
}

export interface PgConfig {
  defaultFormat: 'csv' | 'json' | 'table' | 'toon'
  defaultProfile: string
  profiles: Record<string, DatabaseProfile>
  safety: SafetyConfig
}

export function getPgConnectionOptions(config: PgConfig, profileName: string): ClientConfig {
  const profile = config.profiles[profileName]

  if (!profile) {
    const availableProfiles = Object.keys(config.profiles).join(', ')
    throw new Error(`Profile "${profileName}" not found. Available profiles: ${availableProfiles}`)
  }

  const options: ClientConfig = {
    connectionTimeoutMillis: 10_000,
    database: profile.database,
    host: profile.host,
    password: profile.password,
    port: profile.port,
    user: profile.user,
  }

  if (profile.ssl) {
    options.ssl = {}
  }

  return options
}
