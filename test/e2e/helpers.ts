import {expect} from 'chai'
import {execFile} from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CLI = path.join(REPO_ROOT, 'bin', 'run.js')

export const E2E_HOST = process.env.PG_E2E_HOST ?? '127.0.0.1'
export const E2E_PORT = Number(process.env.PG_E2E_PORT ?? 15_432)
export const E2E_DATABASE = 'pg_e2e'
export const E2E_ALT_DATABASE = 'pg_e2e_alt'
export const E2E_EMPTY_DATABASE = 'pg_e2e_empty'
export const E2E_USER = 'postgres'
export const E2E_PASSWORD = 'pg_e2e_pw'

export type CliResult = {
  code: number
  stderr: string
  stdout: string
}

/**
 * Writes a throwaway oclif config dir holding a `default` profile pointing at
 * the Docker PostgreSQL server, an `alt` profile on a second database, an
 * `empty` profile on a database with no tables, and a `broken` profile with a
 * bad password.
 *
 * @returns Absolute path to the config dir, to be passed as PG_CONFIG_DIR.
 */
export async function createConfigDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-e2e-'))
  const profile = {
    database: E2E_DATABASE,
    host: E2E_HOST,
    maxConcurrentQueries: 5,
    password: E2E_PASSWORD,
    port: E2E_PORT,
    queryQueueTimeoutMs: 10_000,
    ssl: false,
    user: E2E_USER,
  }

  await fs.writeFile(
    path.join(dir, 'pg-config.json'),
    JSON.stringify(
      {
        defaultProfile: 'default',
        profiles: {
          alt: {...profile, database: E2E_ALT_DATABASE},
          broken: {...profile, password: 'definitely-not-the-password'},
          default: profile,
          empty: {...profile, database: E2E_EMPTY_DATABASE},
        },
      },
      null,
      2,
    ),
    {mode: 0o600},
  )

  return dir
}

export async function removeConfigDir(dir: string): Promise<void> {
  await fs.rm(dir, {force: true, recursive: true})
}

/**
 * Runs the built CLI (`bin/run.js`) as a real subprocess against the Docker
 * PostgreSQL server. Non-zero exits are returned rather than thrown so tests
 * can assert on failure paths.
 *
 * Every inherited PG* variable is dropped first. The `pg` driver falls back to
 * libpq environment variables (PGHOST, PGSSLMODE, ...), so a developer's local
 * PostgreSQL settings would otherwise leak into the run.
 *
 * @param args Command line arguments, e.g. ['psql', 'tables'].
 * @param configDir Value for PG_CONFIG_DIR, from createConfigDir().
 * @returns The exit code and captured stdout/stderr.
 */
export async function runCli(args: string[], configDir: string): Promise<CliResult> {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')))
  const env = {...inherited, FORCE_COLOR: '0', NO_COLOR: '1', PG_CONFIG_DIR: configDir}

  try {
    const {stderr, stdout} = await execFileAsync(process.execPath, [CLI, ...args], {
      env,
      maxBuffer: 32 * 1024 * 1024,
    })
    return {code: 0, stderr, stdout}
  } catch (error: unknown) {
    const failure = error as {code?: number; stderr?: string; stdout?: string}
    return {code: failure.code ?? 1, stderr: failure.stderr ?? '', stdout: failure.stdout ?? ''}
  }
}

/**
 * Runs the CLI and fails the test if it exited non-zero.
 *
 * @param args Command line arguments.
 * @param configDir Value for PG_CONFIG_DIR.
 * @returns The successful result.
 */
export async function runCliOk(args: string[], configDir: string): Promise<CliResult> {
  const result = await runCli(args, configDir)
  expect(result.code, `\`pg ${args.join(' ')}\` failed:\n${result.stderr}`).to.equal(0)
  return result
}

/**
 * Runs the CLI with --json and parses stdout.
 *
 * @param args Command line arguments; --json is appended automatically.
 * @param configDir Value for PG_CONFIG_DIR.
 * @returns The parsed JSON payload.
 */
export async function runCliJson<T = unknown>(args: string[], configDir: string): Promise<T> {
  const {stdout} = await runCliOk([...args, '--json'], configDir)
  return JSON.parse(stdout) as T
}
