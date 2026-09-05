# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**pg** is an Oclif-based CLI tool (`bin: pg`) for interacting with PostgreSQL databases. It supports multi-profile connection management, safe query execution, and multiple output formats.

## Development Commands

```bash
# Build
npm run build

# Run all tests
npm test

# Run a single test file
npx mocha test/path/to/test.test.ts

# Run tests with coverage
npm run test:coverage

# Lint and format
npm run lint
npm run format

# Find dead code
npm run find-deadcode

# End-to-end tests against PostgreSQL in Docker (start, build, test, tear down)
npm run test:e2e

# Iterate on e2e tests without restarting the container
npm run e2e:up && npm run build && npm run e2e:mocha
npm run e2e:down
```

## Architecture

```
src/
├── commands/psql/          # Oclif CLI commands (namespace: psql)
│   ├── auth/               # auth add, auth test, auth update
│   ├── query.ts            # Execute arbitrary SQL (formats: table, json, csv, toon)
│   ├── databases.ts        # List databases
│   ├── tables.ts           # List tables
│   ├── describe-table.ts   # Describe table structure
│   ├── indexes.ts          # Show table indexes
│   └── explain-query.ts    # EXPLAIN query plan
├── psql/                   # PostgreSQL interaction layer
│   ├── postgres-client.ts  # Singleton client + exported functions (setConfigDir, getPgConfig, executeQuery, etc.)
│   ├── postgres-utils.ts   # PostgreSQLUtil class — connection pooling, formatting, safety enforcement
│   ├── config-loader.ts    # PgConfig type + getPgConnectionOptions()
│   ├── database.ts         # Result interfaces (QueryResult, DatabaseListResult, etc.)
│   ├── query-validator.ts  # Safety checks: blacklist, confirmation, auto-LIMIT, query analysis
│   └── index.ts            # Re-exports from postgres-client.ts and database.ts
└── config.ts               # readConfig(), DatabaseProfile, PgJsonConfig interfaces
```

### Key Architectural Patterns

**1. Command Pattern:**

Commands are thin Oclif wrappers that:

1. Call `setConfigDir(this.config.configDir)` before any PostgreSQL operation
2. Resolve the profile: `flags.profile ?? (await getPgConfig()).defaultProfile`
3. Call a function from `src/psql/index.js`
4. Call `await closeConnections()` for cleanup
5. Output with `this.log(result.result)`, `this.logJson(...)`, or `this.error(...)`

**2. Singleton Client (`postgres-client.ts`):**

`initPg()` lazily creates a `PostgreSQLUtil` instance using the JSON config loaded from `cachedConfigDir`. `getPgConfig()` returns the cached `PgConfig`. `closeConnections()` tears down all connections and resets the singleton.

**3. Safety System (`query-validator.ts` + `PostgreSQLUtil`):**

- `checkBlacklist`: blocks operations in `blacklistedOperations` (e.g. `DROP DATABASE`)
- `requiresConfirmation`: returns `requiresConfirmation: true` for destructive ops (DELETE, UPDATE, DROP, TRUNCATE, ALTER) unless `skipConfirmation=true`
- `analyzeQuery`: produces warnings for missing WHERE, SELECT \*, missing LIMIT
- `applyDefaultLimit`: auto-appends `LIMIT 100` to SELECT queries without one

**4. Result Types (`database.ts`):**

All PostgreSQL functions return typed result objects with a `success: boolean` field and optional `error` string. Commands check `result.success` to decide whether to log or error.

## Adding a New Command

1. Create `src/commands/psql/<name>.ts` extending `Command`
2. Follow the pattern from `src/commands/psql/tables.ts`:

```typescript
import {Command, Flags} from '@oclif/core'
import {closeConnections, getPgConfig, listTables, setConfigDir} from '../../psql/index.js'

export default class PostgresTables extends Command {
  static override flags = {
    profile: Flags.string({description: 'Database profile name from config', required: false}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(PostgresTables)
    setConfigDir(this.config.configDir)
    let profile: string
    try {
      profile = flags.profile ?? (await getPgConfig()).defaultProfile
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : String(error))
    }
    const result = await listTables(profile)
    await closeConnections()
    if (result.success) {
      this.logJson(result.tables)
    } else {
      this.error(result.error ?? 'Failed')
    }
  }
}
```

3. Add the corresponding function to `PostgreSQLUtil` in `postgres-utils.ts`, export it through `postgres-client.ts` and `psql/index.ts`

## Configuration

Stored at `~/.config/psql/pg-config.json` (multi-profile format):

```json
{
  "defaultProfile": "local",
  "profiles": {
    "local": {
      "host": "localhost",
      "port": 5432,
      "user": "postgres",
      "password": "secret",
      "database": "mydb",
      "ssl": false,
      "maxConcurrentQueries": 5,
      "queryQueueTimeoutMs": 60000
    }
  }
}
```

Auth commands (`pg psql auth add/test/update`) manage this file. `auth add` creates the file with mode `0o600`.

`maxConcurrentQueries` (optional, default 5) caps concurrent queries per profile — queries beyond the cap print a waiting notice to stderr and wait until a running query finishes. `queryQueueTimeoutMs` (optional, default 60000) is how long a query may wait for a free slot before failing with a timeout error; both can be set per profile, falling back to the safety config.

## Testing

- Tests mirror source structure in `test/` (e.g. `test/commands/psql/query.test.ts`)
- Mocha + Chai, `esmock` for module mocking, `sinon` for stubs
- 60-second timeout for all tests

**Command tests** — use `esmock` to mock `src/psql/index.js`, instantiate the command directly, stub `log`/`logJson` on the instance:

```typescript
const imported = await esmock('../../../src/commands/psql/query.js', {
  '../../../src/psql/index.js': {
    closeConnections: closeConnectionsStub,
    executeQuery: executeQueryStub,
    getPgConfig: getPgConfigStub, // stub().resolves(mockConfig)
    setConfigDir: setConfigDirStub,
  },
})
const PostgresQuery = imported.default
const cmd = new PostgresQuery(['SELECT 1'], {
  root: process.cwd(),
  runHook: stub().resolves({failures: [], successes: []}),
} as any)
stub(cmd, 'log')
await cmd.run()
```

**PostgreSQL layer tests** (`test/psql/postgres-utils.test.ts`) — mock `pg.Pool` constructor via esmock:

```typescript
mockPool = {end: stub().resolves(), query: stub()}
const MockPool = stub().returns(mockPool)
const imported = await esmock('../../src/psql/postgres-utils.js', {
  pg: {default: {Pool: MockPool}},
})
// query mock returns pg result format: {rows, fields, rowCount, command}
```

**End-to-end tests** (`test/e2e/*.e2e.test.ts`) — no mocks. `docker/Dockerfile` provisions a
PostgreSQL 17 server seeded from `docker/initdb/`, and `test/e2e/helpers.ts` runs the built
`bin/run.js` as a subprocess with `PG_CONFIG_DIR` pointed at a temp config dir holding
`default`, `alt`, `empty` and `broken` profiles:

```typescript
const configDir = await createConfigDir()
const payload = await runCliJson<{data: {tables: string[]}}>(['psql', 'tables'], configDir)
```

`runCli` returns `{code, stdout, stderr}` without throwing (for failure-path assertions),
`runCliOk` asserts a zero exit, and `runCliJson` appends `--json` and parses stdout. These
files live in `test/e2e/`, which `npm test` skips via `--ignore` — they need a live
server. Run them with `npm run test:e2e`; see `scripts/e2e.sh`.

Each `npm run test:e2e` gets its own Compose project (`pg-e2e-<pid>`) and lets Docker
publish PostgreSQL on a free host port, so concurrent runs never share a database or tear
down each other's container. `PG_E2E_PROJECT` and `PG_E2E_PORT` override both; `e2e:up` /
`e2e:down` use the defaults (`pg-e2e` on 15432), which is why they pair with `e2e:mocha`.
Give concurrent runs separate working trees, though — the build writes a single `dist/`.

The fixtures are fixed in `docker/initdb/01-schema.sql`: `metrics` holds 150 rows so the
default `LIMIT 100` truncates observably, `wide_orders` holds 2000 so the planner really
picks an index for the `explain` assertion, and `quirky` carries NULLs, embedded commas and
a `bytea` column for the formatter tests. Tests that mutate data create their own
`scratch_<name>_<pid>` table rather than touching the fixtures.

**Auth command tests** — mock `@inquirer/prompts` input function in `beforeEach` to avoid blocking on stdin:

```typescript
const mockInput = async ({message}: {message: string}) => {
  if (message.includes('Profile')) return 'local'
  if (message.includes('host')) return 'localhost'
  // ...
}
```

## Important Notes

- All imports use `.js` extensions (ES modules)
- The `static override args` block must be wrapped with `/* eslint-disable/enable perfectionist/sort-objects */` — Oclif parses args positionally
- Functions with more than 3 parameters require `// eslint-disable-next-line max-params` above the signature
- JSDoc `@param` for inline objects must use dot-notation per property (e.g. `@param options.description`)
- Pre-commit hook runs `npm run format && npm run find-deadcode`
- Node.js >=18.0.0 required
- pg driver API: `new pg.Client(opts)` + `client.connect()` → `client.query(sql)` returns `{rows, fields, rowCount, command}`

## Commit Message Convention

**Always use Conventional Commits format:**

- `feat:` — new features
- `fix:` — bug fixes
- `refactor:` — refactoring without behavior change
- `test:` — tests only
- `docs:` — documentation only
- `chore:` — maintenance, deps, build config
