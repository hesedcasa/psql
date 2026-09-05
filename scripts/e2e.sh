#!/usr/bin/env bash
# Runs the end-to-end suite against a disposable PostgreSQL server in Docker.
#
#   npm run test:e2e            # up -> build -> test -> down
#   npm run test:e2e -- --keep  # leave the container running afterwards
#
# Every run gets its own Compose project and a host port Docker picks, so
# concurrent runs neither share a database nor tear down each other's container
# on the way out. Pin either one to reuse a specific server:
#
#   PG_E2E_PROJECT=pg-e2e-b PG_E2E_PORT=15433 npm run test:e2e
#
# Two runs still need separate working trees (a second checkout or a git
# worktree): the build step below writes one `dist/`, which both would rebuild
# from under each other.
#
# Requires Docker with the Compose plugin.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE_FILE="docker/compose.yaml"
KEEP=0
MOCHA_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
    *) MOCHA_ARGS+=("$arg") ;;
  esac
done

if ! docker compose version >/dev/null 2>&1; then
  echo "error: docker compose is required to run the e2e suite" >&2
  exit 1
fi

# The PID keeps each run in its own Compose project, so the `down` below can
# only ever remove the container this run started. Port 0 hands the choice of
# host port to Docker, which is race-free in a way probing for a free port from
# here is not: two runs starting together would both find the same port open.
export PG_E2E_PROJECT="${PG_E2E_PROJECT:-pg-e2e-$$}"
export PG_E2E_PORT="${PG_E2E_PORT:-0}"

cleanup() {
  if [ "$KEEP" -eq 0 ]; then
    echo "==> Stopping PostgreSQL container"
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
  else
    echo "==> Leaving PostgreSQL container up (--keep). Reuse it with:"
    echo "      PG_E2E_PROJECT=$PG_E2E_PROJECT PG_E2E_PORT=$PG_E2E_PORT npm run e2e:mocha"
    echo "    Stop it with:"
    echo "      PG_E2E_PROJECT=$PG_E2E_PROJECT npm run e2e:down"
  fi
}
trap cleanup EXIT

echo "==> Starting PostgreSQL (project $PG_E2E_PROJECT)"
docker compose -f "$COMPOSE_FILE" up -d --build --wait

if [ "$PG_E2E_PORT" = "0" ]; then
  # Ask Docker which host port it published, so the tests can connect to it.
  PG_E2E_PORT="$(docker compose -f "$COMPOSE_FILE" port postgres 5432 | sed 's/.*://')"
  export PG_E2E_PORT
fi

echo "==> PostgreSQL is listening on port $PG_E2E_PORT"

echo "==> Building the CLI"
npm run build

echo "==> Running end-to-end tests"
# The +expansion guard keeps `set -u` happy with an empty array on bash 3.2.
npx mocha --forbid-only "test/e2e/**/*.e2e.test.ts" ${MOCHA_ARGS[@]+"${MOCHA_ARGS[@]}"}
