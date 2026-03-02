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
      "ssl": false
    }
  }
}
```

Auth commands (`pg psql auth add/test/update`) manage this file. `auth add` creates the file with mode `0o600`.

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

**PostgreSQL layer tests** (`test/psql/postgres-utils.test.ts`) — mock `pg.Client` constructor via esmock:

```typescript
mockClient = {connect: stub().resolves(), end: stub().resolves(), query: stub()}
const MockClient = stub().returns(mockClient)
const imported = await esmock('../../src/psql/postgres-utils.js', {
  pg: {default: {Client: MockClient}},
})
// query mock returns pg result format: {rows, fields, rowCount, command}
```

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
