# psql

CLI for PostgreSQL database interaction

[![Version](https://img.shields.io/npm/v/@hesed/psql.svg)](https://npmjs.org/package/@hesed/psql)
[![Downloads/week](https://img.shields.io/npm/dw/@hesed/psql.svg)](https://npmjs.org/package/@hesed/psql)

# Install

```bash
sdkck plugins install @hesed/psql
```

<!-- toc -->
* [psql](#psql)
* [Install](#install)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->
```sh-session
$ npm install -g @hesed/psql
$ pg COMMAND
running command...
$ pg (--version)
@hesed/psql/0.1.0 linux-x64 node-v20.20.0
$ pg --help [COMMAND]
USAGE
  $ pg COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`pg psql auth add`](#pg-psql-auth-add)
* [`pg psql auth test`](#pg-psql-auth-test)
* [`pg psql auth update`](#pg-psql-auth-update)
* [`pg psql databases`](#pg-psql-databases)
* [`pg psql describe-table TABLE`](#pg-psql-describe-table-table)
* [`pg psql explain-query QUERY`](#pg-psql-explain-query-query)
* [`pg psql indexes TABLE`](#pg-psql-indexes-table)
* [`pg psql query QUERY`](#pg-psql-query-query)
* [`pg psql tables`](#pg-psql-tables)

## `pg psql auth add`

Add a PostgreSQL connection profile

```
USAGE
  $ pg psql auth add -d <value> --host <value> -p <value> -P <value> --profile <value> -u <value> [--json] [--ssl]

FLAGS
  -P, --port=<value>      (required) PostgreSQL port
  -d, --database=<value>  (required) Database name
  -p, --password=<value>  (required) Password
  -u, --user=<value>      (required) Username
      --host=<value>      (required) PostgreSQL host
      --profile=<value>   (required) Profile name
      --[no-]ssl          Use SSL

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Add a PostgreSQL connection profile

EXAMPLES
  $ pg psql auth add

  $ pg psql auth add --no-ssl
```

_See code: [src/commands/psql/auth/add.ts](https://github.com/hesedcasa/psql/blob/v0.1.0/src/commands/psql/auth/add.ts)_

## `pg psql auth test`

Test PostgreSQL database connection

```
USAGE
  $ pg psql auth test [--json] [--profile <value>]

FLAGS
  --profile=<value>  Profile name to test

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Test PostgreSQL database connection

EXAMPLES
  $ pg psql auth test

  $ pg psql auth test --profile staging
```

_See code: [src/commands/psql/auth/test.ts](https://github.com/hesedcasa/psql/blob/v0.1.0/src/commands/psql/auth/test.ts)_

## `pg psql auth update`

Update an existing PostgreSQL connection profile

```
USAGE
  $ pg psql auth update -d <value> --host <value> -p <value> -P <value> -u <value> [--json] [--profile <value>] [--ssl]

FLAGS
  -P, --port=<value>      (required) PostgreSQL port
  -d, --database=<value>  (required) Database name
  -p, --password=<value>  (required) Password
  -u, --user=<value>      (required) Username
      --host=<value>      (required) PostgreSQL host
      --profile=<value>   Profile name to update
      --[no-]ssl          Use SSL

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Update an existing PostgreSQL connection profile

EXAMPLES
  $ pg psql auth update --ssl

  $ pg psql auth update --profile staging
```

_See code: [src/commands/psql/auth/update.ts](https://github.com/hesedcasa/psql/blob/v0.1.0/src/commands/psql/auth/update.ts)_

## `pg psql databases`

List all databases accessible on the PostgreSQL server

```
USAGE
  $ pg psql databases [--profile <value>]

FLAGS
  --profile=<value>  Database profile name from config

DESCRIPTION
  List all databases accessible on the PostgreSQL server

EXAMPLES
  $ pg psql databases

  $ pg psql databases --profile staging
```

_See code: [src/commands/psql/databases.ts](https://github.com/hesedcasa/psql/blob/v0.1.0/src/commands/psql/databases.ts)_

## `pg psql describe-table TABLE`

Describe the structure of a PostgreSQL table

```
USAGE
  $ pg psql describe-table TABLE [--format table|json|toon] [--profile <value>]

ARGUMENTS
  TABLE  Table name to describe

FLAGS
  --format=<option>  [default: table] Output format
                     <options: table|json|toon>
  --profile=<value>  Database profile name from config

DESCRIPTION
  Describe the structure of a PostgreSQL table

EXAMPLES
  $ pg psql describe-table users

  $ pg psql describe-table orders --format json --profile prod
```

_See code: [src/commands/psql/describe-table.ts](https://github.com/hesedcasa/psql/blob/v0.1.0/src/commands/psql/describe-table.ts)_

## `pg psql explain-query QUERY`

Show the execution plan for a PostgreSQL query

```
USAGE
  $ pg psql explain-query QUERY [--format table|json|toon] [--profile <value>]

ARGUMENTS
  QUERY  SQL query to explain

FLAGS
  --format=<option>  [default: table] Output format
                     <options: table|json|toon>
  --profile=<value>  Database profile name from config

DESCRIPTION
  Show the execution plan for a PostgreSQL query

EXAMPLES
  $ pg psql explain-query "SELECT * FROM users WHERE id = 1"

  $ pg psql explain-query "SELECT * FROM orders JOIN users ON orders.user_id = users.id" --format json
```

_See code: [src/commands/psql/explain-query.ts](https://github.com/hesedcasa/psql/blob/v0.1.0/src/commands/psql/explain-query.ts)_

## `pg psql indexes TABLE`

Show indexes for a PostgreSQL table

```
USAGE
  $ pg psql indexes TABLE [--format table|json|toon] [--profile <value>]

ARGUMENTS
  TABLE  Table name to show indexes for

FLAGS
  --format=<option>  [default: table] Output format
                     <options: table|json|toon>
  --profile=<value>  Database profile name from config

DESCRIPTION
  Show indexes for a PostgreSQL table

EXAMPLES
  $ pg psql indexes users

  $ pg psql indexes orders --format json --profile prod
```

_See code: [src/commands/psql/indexes.ts](https://github.com/hesedcasa/psql/blob/v0.1.0/src/commands/psql/indexes.ts)_

## `pg psql query QUERY`

Execute a SQL query against a PostgreSQL database

```
USAGE
  $ pg psql query QUERY [--format table|json|csv|toon] [--profile <value>] [--skip-confirmation]

ARGUMENTS
  QUERY  SQL query to execute

FLAGS
  --format=<option>    [default: table] Output format
                       <options: table|json|csv|toon>
  --profile=<value>    Database profile name from config
  --skip-confirmation  Skip confirmation prompt for destructive operations

DESCRIPTION
  Execute a SQL query against a PostgreSQL database

EXAMPLES
  $ pg psql query "SELECT * FROM users LIMIT 10"

  $ pg psql query "UPDATE users SET email = 'user@email.com' WHERE id = 999" --format json

  $ pg psql query "DELETE FROM sessions" --profile prod --skip-confirmation
```

_See code: [src/commands/psql/query.ts](https://github.com/hesedcasa/psql/blob/v0.1.0/src/commands/psql/query.ts)_

## `pg psql tables`

List all tables in the current PostgreSQL database

```
USAGE
  $ pg psql tables [--profile <value>]

FLAGS
  --profile=<value>  Database profile name from config

DESCRIPTION
  List all tables in the current PostgreSQL database

EXAMPLES
  $ pg psql tables

  $ pg psql tables --profile local
```

_See code: [src/commands/psql/tables.ts](https://github.com/hesedcasa/psql/blob/v0.1.0/src/commands/psql/tables.ts)_
<!-- commandsstop -->
