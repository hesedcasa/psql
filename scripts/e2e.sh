#!/usr/bin/env bash
# Runs the end-to-end suite against a disposable PostgreSQL server in Docker —
# twice: once through the built standalone CLI, then again through the latest
# sdkck host CLI with this build packed and installed as its @hesed/psql plugin.
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

# The throwaway sdkck home this script creates, if it got that far. Deliberately
# NOT named SDKCK_HOME: an inherited SDKCK_HOME could point at the developer's
# real sdkck setup, and the EXIT trap must never rm -rf that. This variable only
# ever holds a path this script itself mktemp'd.
SDKCK_E2E_HOME=""

cleanup() {
  local status=$?
  # A setup step that aborts under `set -e` after a failed leg would otherwise
  # replace that leg's status; the first failure is the one to report.
  if [ "${EXIT_STATUS:-0}" -ne 0 ]; then
    status=$EXIT_STATUS
  fi

  if [ -n "$SDKCK_E2E_HOME" ]; then
    # `npm pack` can fail after `prepack` has already rewritten README.md, so
    # the restore lives here rather than only after the pack.
    if [ -f "$SDKCK_E2E_HOME/README.md.orig" ]; then
      cp "$SDKCK_E2E_HOME/README.md.orig" README.md
    fi
    rm -rf "$SDKCK_E2E_HOME"
  fi

  if [ "$KEEP" -eq 0 ]; then
    echo "==> Stopping PostgreSQL container"
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
  else
    echo "==> Leaving PostgreSQL container up (--keep). Reuse it with:"
    echo "      PG_E2E_PROJECT=$PG_E2E_PROJECT PG_E2E_PORT=$PG_E2E_PORT npm run e2e:mocha"
    echo "    Stop it with:"
    echo "      PG_E2E_PROJECT=$PG_E2E_PROJECT npm run e2e:down"
  fi

  exit "$status"
}
trap cleanup EXIT

run_mocha() {
  # Delegates to the `e2e:mocha` script rather than calling mocha directly, so
  # both entry points share one glob and one timeout.
  # The +expansion guard keeps `set -u` happy with an empty array on bash 3.2.
  npm run --silent e2e:mocha -- ${MOCHA_ARGS[@]+"${MOCHA_ARGS[@]}"}
}

# Records the first failing leg's status. A later leg failing with a different
# status must not overwrite an earlier failure: the script's contract is to
# exit with the first failure it saw.
EXIT_STATUS=0
record_failure() {
  local leg_status=$?
  [ "$EXIT_STATUS" -ne 0 ] || EXIT_STATUS=$leg_status
}

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
# Both legs always run: a standalone-leg failure says nothing about the packed
# plugin, and vice versa. The `|| record_failure` form keeps `set -e` from
# aborting so the sdkck leg still executes; the first failure becomes the exit
# code.
run_mocha || record_failure

# Second leg: the same suite through the sdkck host CLI, with this build
# installed as its @hesed/psql plugin.
echo "==> Downloading the latest sdkck"
# --no-save resolves "latest" from the registry on every run without touching
# package.json; the binary comes from node_modules/.bin.
npm install --silent --no-save sdkck
export PATH="$PWD/node_modules/.bin:$PATH"

# A throwaway sdkck home keeps the plugin install, its config and its caches
# out of the developer's real sdkck setup; the test side finds it via
# E2E_SDKCK_HOME.
SDKCK_E2E_HOME="$(mktemp -d)"
export E2E_SDKCK_HOME="$SDKCK_E2E_HOME"
SDKCK_DIRS=(
  SDKCK_CACHE_DIR="$SDKCK_E2E_HOME/cache"
  SDKCK_CONFIG_DIR="$SDKCK_E2E_HOME/config"
  SDKCK_DATA_DIR="$SDKCK_E2E_HOME/data"
)

# A fresh home cannot hold the plugin yet; if it does, the leg would test
# whatever is there rather than this build. `plugins inspect` is a host
# command, so the probe cannot itself trigger sdkck's first-use install.
if env "${SDKCK_DIRS[@]}" sdkck plugins inspect @hesed/psql --json >/dev/null 2>&1; then
  echo "error: @hesed/psql is already installed in the throwaway sdkck home" >&2
  exit 1
fi

echo "==> Packing the current build and installing it as an sdkck plugin"
# npm pack runs `prepack`, regenerating oclif.manifest.json and the README —
# the same artifacts the publish workflow ships — so the sdkck leg exercises
# the real install artifact, not just the working tree. Packing straight into
# the throwaway home keeps the tarball out of the repo root; the EXIT trap
# removes it with the rest of the home.
# `oclif readme` stamps the local platform into README.md's usage block, so
# the committed README is backed up here and put back by the EXIT trap rather
# than left modified.
cp README.md "$SDKCK_E2E_HOME/README.md.orig"
TGZ="$(npm pack --pack-destination "$SDKCK_E2E_HOME" | tail -n 1)"
# A move, not a copy: once README.md is back, the EXIT trap must have nothing
# left to restore, or it would overwrite edits made while the sdkck leg runs.
mv "$SDKCK_E2E_HOME/README.md.orig" README.md

# Installing here — before any `sdkck psql` invocation — stops sdkck's
# first-use auto-installer from pulling the published @hesed/psql release
# over the build under test. The tarball must be passed as a `file:` URL:
# sdkck resolves any bare path containing a slash as a GitHub org/repo.
env "${SDKCK_DIRS[@]}" sdkck plugins install "file:$SDKCK_E2E_HOME/$TGZ"

# Prove dispatch resolves to the tarball this run packed, not a published
# release the auto-installer could have fetched: the install record sdkck
# writes under the data dir must carry our file: URL. The record is read from
# disk rather than via `sdkck plugins inspect`, which has been observed to die
# on an unsettled top-level await right after loading a freshly installed
# plugin.
grep -Fq "\"file:$SDKCK_E2E_HOME/$TGZ\"" "$SDKCK_E2E_HOME/data/package.json" || {
  echo "error: sdkck did not register the packed tarball as @hesed/psql" >&2
  exit 1
}

echo "==> Running end-to-end tests via sdkck"
E2E_HOST_CLI=sdkck run_mocha || record_failure

exit "$EXIT_STATUS"
