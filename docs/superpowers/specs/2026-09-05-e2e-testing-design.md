# Docker-backed end-to-end testing for `pg`

Date: 2026-09-05
Status: approved, not yet implemented

## Summary

Add an end-to-end test suite that runs the built `pg` CLI as a real subprocess
against a disposable PostgreSQL 17 server in Docker. No mocks: the tests drive
`bin/run.js`, which loads `dist/`, which opens real sockets to a real server
holding real seed data.

The suite is modeled on `hesedcasa/mysql` PR #92, adapted to PostgreSQL and to
this repository's `@hesed/plugin-lib` profile handling.

Writing the tests first exposes five defects in `src/psql/query-validator.ts`
and `src/psql/postgres-utils.ts`. Closing them is in scope: each test is
written RED against the current code and turned GREEN by the corresponding
fix.

## Motivation

Every existing test mocks the database. `test/psql/postgres-utils.test.ts`
stubs `pg.Pool`; the command tests stub `src/psql/index.js` wholesale. That
leaves whole categories of defect invisible:

- SQL this CLI generates is never parsed by PostgreSQL. `applyDefaultLimit`
  produces `SELECT id FROM metrics; LIMIT 100` for any semicolon-terminated
  SELECT — a syntax error no unit test catches, because no unit test has a
  parser.
- Safety guards are never tested against a server that would really execute
  the query they failed to block.
- Output formatting (`table`, `toon`, CSV escaping) is never tested against
  values PostgreSQL actually returns — `Date` objects, `Buffer`s, `null`s.
- The `pg` driver's own behavior is stubbed away, including its habit of
  returning an *array* of results for a multi-statement query.

## Design

### 1. Container (`docker/`)

**`docker/Dockerfile`** — `FROM postgres:17-alpine`.

Credentials are fixtures for a throwaway local container, not secrets:
`POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=pg_e2e_pw`, `POSTGRES_DB=pg_e2e`.
`initdb/` is copied to `/docker-entrypoint-initdb.d/`, so the seed data is
baked into the image and a fresh container is always a fresh, fully-populated
database.

The healthcheck is `pg_isready -h 127.0.0.1 -U postgres -d pg_e2e`. The `-h`
is load-bearing: the entrypoint's seeding phase runs a temporary server with
`listen_addresses=''`, reachable only over the Unix socket. A TCP probe
therefore fails until seeding is committed and the real server is listening,
which is exactly the condition the tests need.

Version 17 rather than 18 is deliberate: 18 relocated `PGDATA` to
`/var/lib/postgresql/18/docker`, which would move the tmpfs mount below.

**`docker/compose.yaml`** — one `postgres` service.

- `name: ${PG_E2E_PROJECT:-pg-e2e}` — overridable so concurrent runs get
  separate Compose projects.
- `ports: ['${PG_E2E_PORT:-15432}:5432']` — overridable so the container never
  fights a local PostgreSQL. `scripts/e2e.sh` passes `0` and lets Docker pick.
- `tmpfs: ['/var/lib/postgresql/data']` — the data directory lives in RAM.
  Fast startup, and every `up` is a clean database with no volume to drift.
- The same healthcheck as the image, restated so `--wait` uses it.

**`docker/initdb/01-schema.sql`** — runs as `postgres` against `pg_e2e`. It
creates the two extra databases, then uses the `psql` meta-command `\connect`
to populate each. Anything the tests assert on — table names, column names,
index names, row counts — is fixed here. Tests that mutate data create their
own scratch tables, so re-running the suite against a live container is safe.

Databases:

| database | contents | purpose |
|---|---|---|
| `pg_e2e` | the fixture tables below | the `default` profile |
| `pg_e2e_alt` | one table, `audit_log` | the `alt` profile; proves `--profile` switches the database |
| `pg_e2e_empty` | no tables | proves `tables` reports an empty database without failing |

Fixture tables in `pg_e2e`:

| table | shape | why |
|---|---|---|
| `users` | `id`, `email` (unique), `name`, `status` (enum type `user_status`), `created_at` | The enum makes `describe-table` report `USER-DEFINED`; the unique index and the plain `idx_users_status` let `indexes` distinguish the two. |
| `orders` | `id`, `user_id` FK, `total numeric(10,2)`, `status varchar(32)`, `created_at` | Small and human-readable, for the join assertions. `varchar(32)` gives `describe-table` a non-null `character_maximum_length` to report next to the enum's and `numeric`'s null one. |
| `wide_orders` | `id`, `user_id`, `amount`, index on `user_id`, ~2000 rows | Enough rows that the planner really chooses an index scan, so the `EXPLAIN` assertion tests something rather than restating itself. |
| `metrics` | `id`, `label`, `value`, 150 rows via `generate_series` | More rows than the default `LIMIT 100`, so truncation is observable through the CLI. |
| `quirky` | `note text NULL`, `payload bytea NULL`, `recorded timestamptz NULL` | Exercises CSV escaping (commas, quotes, newlines) and the TOON formatter's `Date`→ISO and `Buffer`→base64 branches. |

**`docker/initdb/02-seed.sql`** — the row data. Fixed ids and fixed timestamps
so assertions can be exact.

### 2. Runner (`scripts/e2e.sh`)

`up -> build -> mocha -> down`, with `--keep` to leave the container running
for iteration. Any other argument is forwarded to mocha, so
`npm run test:e2e -- --grep safety` works.

Concurrency is the reason this is a script and not a chain of npm scripts.
Each run exports `PG_E2E_PROJECT=pg-e2e-$$` and `PG_E2E_PORT=0`:

- The PID keeps each run in its own Compose project, so the `down` in the exit
  trap can only ever remove the container this run started.
- Port `0` hands the choice of host port to Docker, which is race-free in a way
  that probing for a free port from the script is not — two runs starting
  together would both find the same port open. After `up`, the script reads the
  chosen port back with `docker compose port postgres 5432`.

Two concurrent runs still need separate working trees (a second checkout or a
git worktree): the build step writes one `dist/`, which both would rebuild from
under each other. This is documented in the script header.

The script fails fast with a clear message if `docker compose` is unavailable.

### 3. Package scripts

```
"test":      "mocha --forbid-only \"test/**/*.test.ts\" --ignore \"test/e2e/**\"",
"test:e2e":  "./scripts/e2e.sh",
"e2e:up":    "docker compose -f docker/compose.yaml up -d --build --wait",
"e2e:down":  "docker compose -f docker/compose.yaml down -v --remove-orphans",
"e2e:mocha": "mocha --forbid-only \"test/e2e/**/*.e2e.test.ts\""
```

`npm test` must ignore `test/e2e/**` — those files need a live server, and
`test/**/*.test.ts` would otherwise match them.

`e2e:up` / `e2e:down` / `e2e:mocha` stay on the compose defaults (`pg-e2e` on
port 15432), which is what makes them a usable trio for iterating without
restarting the container, and what CI drives step by step so a failure can dump
container logs before teardown.

### 4. Harness (`test/e2e/helpers.ts`)

`createConfigDir()` creates a temp directory and writes `pg-config.json` with
mode `0o600`, holding four profiles:

| profile | database | credentials | covers |
|---|---|---|---|
| `default` | `pg_e2e` | valid | the happy path |
| `alt` | `pg_e2e_alt` | valid | `--profile` selecting a different database |
| `empty` | `pg_e2e_empty` | valid | an empty database |
| `broken` | `pg_e2e` | wrong password | the failure path |

The `broken` profile really fails: the official image defaults host
authentication to `scram-sha-256` whenever `POSTGRES_PASSWORD` is set, so a
wrong password is rejected by the server rather than waved through.

The file is plain JSON. `@hesed/plugin-lib`'s `createProfileManager` reads it
from `config.configDir` with no keychain or encryption involved, so writing it
directly is equivalent to what `pg psql auth add` produces.

`runCli(args, configDir)` runs `process.execPath bin/run.js <args>` with
`PG_CONFIG_DIR` set to the temp dir, plus `NO_COLOR=1` and `FORCE_COLOR=0`.
oclif resolves `PG_CONFIG_DIR` through `scopedEnvVar('CONFIG_DIR')`, which
uppercases `bin` (`pg`) and joins — so this is the supported override, not a
hack. Non-zero exits are returned rather than thrown, so tests can assert on
failure paths.

`runCliOk(args, configDir)` asserts exit 0 and includes stderr in the failure
message. `runCliJson<T>(args, configDir)` appends `--json` and parses stdout.

The CLI must be built before these run — `bin/run.js` loads `dist/`, not
`src/`. `scripts/e2e.sh` and the CI job both build first.

### 5. Specs

Four files, split so a failure names its own area.

**`connection.e2e.test.ts`** — `auth test` succeeds on the default profile and
reports PostgreSQL 17 and database `pg_e2e`; `auth list` shows all four
profiles with `default` flagged; `auth test -p broken` exits non-zero with
`Failed to connect to PostgreSQL.` (the spinner glyph is not asserted — it is
not reliably emitted outside a TTY); a query on the `broken` profile surfaces the driver's
authentication error and does *not* contain `Error: ERROR:`; a nonexistent
config dir fails with a message about profiles; `databases` lists all three
fixture databases; `tables` and `tables -p alt` return different tables;
human output contains `Databases:` and `• pg_e2e`.

**`query.e2e.test.ts`** — SELECT as JSON with exact rows; a join with
aggregation; an empty result set succeeds; the default `LIMIT 100` truncates
`metrics` to 100 rows; the same holds when a column alias contains `limit`,
when a *string literal* reads as a LIMIT clause, when a quoted identifier is
named `"limit"`, when the statement is semicolon-terminated, and when a
comment trails the semicolon; an explicit `LIMIT 120` is left alone; notices
(`SELECT *` warning, no-LIMIT warning, `Applied default LIMIT 100`,
`Rows returned: 100`) are emitted; `--toon` renders TOON; TOON serializes
timestamps to ISO, NULLs, and `bytea` to base64; human output renders the box
table; a syntax error is surfaced; a multi-statement query behaves per
decision A below.

**`safety.e2e.test.ts`** — `DROP DATABASE pg_e2e_alt` is blocked, and the
database is verified still present afterwards; the same holds with doubled
whitespace and with a comment wedged between the two keywords; a `DELETE`
behind a leading block comment and a newline still triggers the confirmation
gate, verified against a scratch table so a regression cannot touch the
fixtures; a destructive query without `--skip-confirmation` changes nothing;
INSERT/UPDATE/DELETE round-trip against a scratch table; an `UPDATE` with no
`WHERE` against a table whose *name* contains `nowhere` still warns and still
runs; a table created through the CLI appears in `tables` and disappears after
`DROP`; eight concurrent CLI invocations using `pg_sleep` all succeed; the CLI
exits promptly and leaves no connection open, checked against
`pg_stat_activity`.

Each test that mutates data owns a uniquely named scratch table
(`scratch_<name>_<pid>`), dropped in `after`, so the suite is re-runnable
against a long-lived container.

**`schema.e2e.test.ts`** — `tables` lists the seeded tables; `tables -p empty`
succeeds with an empty list, and its human output prints the heading with no
bullets under it (this repo has no "no tables found" message, and adding one is
out of scope); `describe-table`
reports column names, data types, `character_maximum_length` and nullability,
including `USER-DEFINED` for the enum; `indexes` reports the primary key, the
unique index and the plain index, distinguishable via `indexdef`; `explain`
on `wide_orders` returns a plan naming an index scan; `describe-table`
renders both a box table and TOON; `describe-table` on a missing table behaves
per decision B below.

### 6. Fixes

Written RED first: each test below fails against the current code and passes
after the corresponding change.

**`src/psql/query-validator.ts` — rewrite the matching.** Today every check is
a substring match over the uppercased query. That is wrong in both directions:
it misses real operations and fires on innocent identifiers.

The rewrite introduces a normalization pass that blanks out everything which is
not SQL structure, then matches whole words against the normalized form while
returning offsets into the original string. Normalization must handle
PostgreSQL's lexical rules, which differ from MySQL's:

- `--` line comments and `/* */` block comments, which in PostgreSQL **nest**.
- `'single quoted'` strings, with `''` as the escape.
- `E'...'` escape strings, where `\'` is also an escape.
- `"quoted identifiers"`, with `""` as the escape.
- `$$ ... $$` and `$tag$ ... $tag$` dollar-quoted strings.

Against that normalized form:

- `checkBlacklist` matches each blacklisted operation as whole words separated
  by arbitrary whitespace, so `DROP  DATABASE` and `DROP/* x */DATABASE` are
  both caught.
- `requiresConfirmation` matches the operation as the statement's first
  keyword, so a leading comment or newline no longer bypasses the gate, and
  a row whose text happens to contain `delete` no longer triggers it.
- `analyzeQuery` matches `WHERE` and `LIMIT` on word boundaries, so
  `UPDATE nowhere_stats SET ...` warns and `SELECT id AS limit_reached ...`
  does not suppress the LIMIT notice.
- `applyDefaultLimit` uses the same word-boundary `LIMIT` detection and
  inserts the clause *before* any trailing semicolon and trailing comment.

`getQueryType` reads the first keyword of the normalized form, so a leading
comment no longer yields `UNKNOWN`.

A new `test/psql/query-validator.test.ts` covers these directly — the file does
not exist today, so the validator currently has no unit tests at all.

**`src/psql/postgres-utils.ts` — stop doubling the error prefix.** Seven catch
blocks return `` `ERROR: ${message}` ``, and oclif's `this.error()` prepends
its own `Error:` label, so users see `Error: ERROR: relation ... does not
exist`. Drop the prefix at all seven sites.

Six command test files (`databases`, `describe-table`, `explain`, `indexes`,
`query`, `tables`) seed a stub with an `ERROR: `-prefixed string. Those are
stub inputs rather than assertions on the prefix, so they still pass either
way, but each is a one-line update to keep the fixtures honest about what the
layer now returns.

**Decision A — multi-statement queries (in scope).** For
`SELECT 1; SELECT 2`, the `pg` driver returns an array of results rather than
one result. `runQuery`'s callers then read `result.rows.length` on `undefined`
and the user gets `ERROR: Cannot read properties of undefined (reading
'length')`. `runQuery` will take the last element when an array comes back —
the natural PostgreSQL semantic, and it keeps the e2e assertion meaningful.

**Decision B — `describe-table` on a missing table (out of scope).** Unlike
MySQL, the `information_schema` query returns zero rows rather than raising,
so `pg psql describe-table typo` exits 0 with an empty structure. This is a
footgun, but changing it is a behavior change beyond this work. The e2e test
asserts the current behavior, documenting it; a follow-up can make it an
error. `indexes` has the same shape and the same treatment.

### 7. CI (`.github/workflows/run-e2e-tests.yml`)

Ubuntu only — Docker with the Compose plugin is preinstalled on the Ubuntu
runners and not on the macOS or Windows ones.

The job runs the same steps `npm run test:e2e` performs, split out so the
container is still alive to dump logs from when a test fails: `e2e:up`,
`build`, `e2e:mocha`, then `docker compose logs postgres` on failure and
`e2e:down` always.

Checkout uses `persist-credentials: false` — nothing here pushes, and the
token should not sit in `.git/config` while `npm ci` and the build run pull
request code. A `[Required] End-to-end tests passed` gating job mirrors the
pattern already in `run-tests.yml`, for branch protection.

### 8. Documentation

`CLAUDE.md` gains the new commands under Development Commands and a
"End-to-end tests" subsection under Testing, covering the helper API, the
`--ignore` on `npm test`, and the per-run Compose project. `README.md` gains a
short contributor-facing note on running the suite.

## Testing

- `npm test` green (existing suites plus the new validator unit tests).
- `npm run test:e2e` green from a cold Docker start.
- `npm run lint` and `npx prettier --check .` clean.
- `npm run find-deadcode` clean.
- Every fix in section 6 verified RED before the change and GREEN after.

## Out of scope

- Making `describe-table` and `indexes` error on a missing table (decision B).
- Any change to the command layer or to `@hesed/plugin-lib`.
- Running e2e tests on macOS or Windows CI runners.
- Testing `auth add` / `auth update` interactively; they block on stdin and are
  already covered by unit tests.
