import type {ClientConfig} from 'pg'

import type {DatabaseProfile} from '../config.js'

/**
 * Safety configuration for query execution
 */
interface SafetyConfig {
  blacklistedOperations: string[]
  defaultLimit: number
  requireConfirmationFor: string[]
}

/**
 * Main configuration structure
 */
export interface PgConfig {
  defaultFormat: 'csv' | 'json' | 'table' | 'toon'
  defaultProfile: string
  profiles: Record<string, DatabaseProfile>
  safety: SafetyConfig
}

/**
 * Get PostgreSQL connection options for a specific profile
 *
 * @param config - Configuration object
 * @param profileName - Profile name
 * @returns pg ClientConfig options
 */
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
