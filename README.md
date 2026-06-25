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
@hesed/psql/0.5.1 linux-x64 node-v22.23.0
$ pg --help [COMMAND]
USAGE
  $ pg COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`pg psql auth add`](#pg-psql-auth-add)
* [`pg psql auth delete`](#pg-psql-auth-delete)
* [`pg psql auth list`](#pg-psql-auth-list)
* [`pg psql auth profile`](#pg-psql-auth-profile)
* [`pg psql auth test`](#pg-psql-auth-test)
* [`pg psql auth update`](#pg-psql-auth-update)
* [`pg psql databases`](#pg-psql-databases)
* [`pg psql describe-table TABLE`](#pg-psql-describe-table-table)
* [`pg psql explain-query QUERY`](#pg-psql-explain-query-query)
* [`pg psql indexes TABLE`](#pg-psql-indexes-table)
* [`pg psql query QUERY`](#pg-psql-query-query)
* [`pg psql tables`](#pg-psql-tables)

## `pg psql auth add`

Add PostgreSQL authentication

```
USAGE
  $ pg psql auth add -p <value> --host <value> --port <value> -u <value> --password <value> -d <value> --ssl
    [--json]

FLAGS
  -d, --database=<value>  (required) Database name
  -p, --profile=<value>   (required) Profile name
  -u, --user=<value>      (required) Username
      --host=<value>      (required) PostgreSQL host
      --password=<value>  (required) Password
      --port=<value>      (required) PostgreSQL port
      --ssl               (required) Use SSL

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Add PostgreSQL authentication

EXAMPLES
  $ pg psql auth add

  $ pg psql auth add -p prod
```

_See code: [src/commands/psql/auth/add.ts](https://github.com/hesedcasa/psql/blob/v0.5.1/src/commands/psql/auth/add.ts)_

## `pg psql auth delete`

Delete an authentication profile

```
USAGE
  $ pg psql auth delete [--json] [-p <value>]

FLAGS
  -p, --profile=<value>  Profile to delete

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Delete an authentication profile

EXAMPLES
  $ pg psql auth delete

  $ pg psql auth delete -p prod
```

_See code: [src/commands/psql/auth/delete.ts](https://github.com/hesedcasa/psql/blob/v0.5.1/src/commands/psql/auth/delete.ts)_

## `pg psql auth list`

List authentication profiles

```
USAGE
  $ pg psql auth list [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List authentication profiles

EXAMPLES
  $ pg psql auth list
```

_See code: [src/commands/psql/auth/list.ts](https://github.com/hesedcasa/psql/blob/v0.5.1/src/commands/psql/auth/list.ts)_

## `pg psql auth profile`

Set or show the default authentication profile

```
USAGE
  $ pg psql auth profile [--json] [--default <value>]

FLAGS
  --default=<value>  Profile to set as default

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Set or show the default authentication profile

EXAMPLES
  $ pg psql auth profile

  $ pg psql auth profile --default test
```

_See code: [src/commands/psql/auth/profile.ts](https://github.com/hesedcasa/psql/blob/v0.5.1/src/commands/psql/auth/profile.ts)_

## `pg psql auth test`

Test authentication and connection

```
USAGE
  $ pg psql auth test [--json] [-p <value>]

FLAGS
  -p, --profile=<value>  Authentication profile name

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Test authentication and connection

EXAMPLES
  $ pg psql auth test

  $ pg psql auth test -p prod
```

_See code: [src/commands/psql/auth/test.ts](https://github.com/hesedcasa/psql/blob/v0.5.1/src/commands/psql/auth/test.ts)_

## `pg psql auth update`

Update PostgreSQL authentication

```
USAGE
  $ pg psql auth update -p <value> --host <value> --port <value> -u <value> --password <value> -d <value> --ssl
    [--json]

FLAGS
  -d, --database=<value>  (required) Database name
  -p, --profile=<value>   (required) Profile name
  -u, --user=<value>      (required) Username
      --host=<value>      (required) PostgreSQL host
      --password=<value>  (required) Password
      --port=<value>      (required) PostgreSQL port
      --ssl               (required) Use SSL

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Update PostgreSQL authentication

EXAMPLES
  $ pg psql auth update

  $ pg psql auth update -p test
```

_See code: [src/commands/psql/auth/update.ts](https://github.com/hesedcasa/psql/blob/v0.5.1/src/commands/psql/auth/update.ts)_

## `pg psql databases`

List all databases accessible on the PostgreSQL server

```
USAGE
  $ pg psql databases [--json] [-p <value>]

FLAGS
  -p, --profile=<value>  Database profile name from config

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List all databases accessible on the PostgreSQL server

EXAMPLES
  $ pg psql databases

  $ pg psql databases -p staging
```

_See code: [src/commands/psql/databases.ts](https://github.com/hesedcasa/psql/blob/v0.5.1/src/commands/psql/databases.ts)_

## `pg psql describe-table TABLE`

Describe the structure of a PostgreSQL table

```
USAGE
  $ pg psql describe-table TABLE [--json] [--format table|json|toon] [-p <value>]

ARGUMENTS
  TABLE  Table name to describe

FLAGS
  -p, --profile=<value>  Database profile name from config
      --format=<option>  [default: table] Output format
                         <options: table|json|toon>

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Describe the structure of a PostgreSQL table

EXAMPLES
  $ pg psql describe-table users

  $ pg psql describe-table orders --format json -p prod
```

_See code: [src/commands/psql/describe-table.ts](https://github.com/hesedcasa/psql/blob/v0.5.1/src/commands/psql/describe-table.ts)_

## `pg psql explain-query QUERY`

Show the execution plan for a PostgreSQL query

```
USAGE
  $ pg psql explain-query QUERY [--json] [--format table|json|toon] [-p <value>]

ARGUMENTS
  QUERY  SQL query to explain

FLAGS
  -p, --profile=<value>  Database profile name from config
      --format=<option>  [default: table] Output format
                         <options: table|json|toon>

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show the execution plan for a PostgreSQL query

EXAMPLES
  $ pg psql explain-query "SELECT * FROM users WHERE id = 1"

  $ pg psql explain-query "SELECT * FROM orders JOIN users ON orders.user_id = users.id" --format json
```

_See code: [src/commands/psql/explain-query.ts](https://github.com/hesedcasa/psql/blob/v0.5.1/src/commands/psql/explain-query.ts)_

## `pg psql indexes TABLE`

Show indexes for a PostgreSQL table

```
USAGE
  $ pg psql indexes TABLE [--json] [--format table|json|toon] [-p <value>]

ARGUMENTS
  TABLE  Table name to show indexes for

FLAGS
  -p, --profile=<value>  Database profile name from config
      --format=<option>  [default: table] Output format
                         <options: table|json|toon>

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show indexes for a PostgreSQL table

EXAMPLES
  $ pg psql indexes users

  $ pg psql indexes orders --format json -p prod
```

_See code: [src/commands/psql/indexes.ts](https://github.com/hesedcasa/psql/blob/v0.5.1/src/commands/psql/indexes.ts)_

## `pg psql query QUERY`

Execute a SQL query against a PostgreSQL database

```
USAGE
  $ pg psql query QUERY [--json] [--format table|json|csv|toon] [-p <value>] [--skip-confirmation]

ARGUMENTS
  QUERY  SQL query to execute

FLAGS
  -p, --profile=<value>    Database profile name from config
      --format=<option>    [default: table] Output format
                           <options: table|json|csv|toon>
      --skip-confirmation  Skip confirmation prompt for destructive operations

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Execute a SQL query against a PostgreSQL database

EXAMPLES
  $ pg psql query "SELECT * FROM users LIMIT 10"

  $ pg psql query "UPDATE users SET email = 'user@email.com' WHERE id = 999" --format json

  $ pg psql query "DELETE FROM sessions" -p prod --skip-confirmation
```

_See code: [src/commands/psql/query.ts](https://github.com/hesedcasa/psql/blob/v0.5.1/src/commands/psql/query.ts)_

## `pg psql tables`

List all tables in the current PostgreSQL database

```
USAGE
  $ pg psql tables [--json] [-p <value>]

FLAGS
  -p, --profile=<value>  Database profile name from config

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List all tables in the current PostgreSQL database

EXAMPLES
  $ pg psql tables

  $ pg psql tables -p local
```

_See code: [src/commands/psql/tables.ts](https://github.com/hesedcasa/psql/blob/v0.5.1/src/commands/psql/tables.ts)_
<!-- commandsstop -->
