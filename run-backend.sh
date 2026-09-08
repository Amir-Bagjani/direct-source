#!/usr/bin/env bash
# Run the complete local stack; always preserve named data volumes.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/apps/backend"
command -v docker >/dev/null || { echo 'Install Docker Desktop first.' >&2; exit 1; }
docker compose version >/dev/null
if ! docker info >/dev/null 2>&1; then
  if [[ "$(uname -s)" == Darwin ]]; then
    echo 'Starting Docker Desktop...'
    open -a Docker
    for ((attempt=0; attempt<120; attempt++)); do
      docker info >/dev/null 2>&1 && break
      sleep 1
    done
  fi
  docker info >/dev/null 2>&1 || { echo 'Start Docker and run this script again.' >&2; exit 1; }
fi
if [[ ! -f .env ]]; then
  (umask 077; cp .env.example .env)
fi
compose=(docker compose --progress plain --profile full --profile app)
child=''
cleanup() {
  result=$?
  trap - EXIT INT TERM
  if [[ -n "$child" ]]; then
    kill "$child" 2>/dev/null || true
    wait "$child" 2>/dev/null || true
  fi
  echo 'Stopping backend containers (data is preserved)...'
  "${compose[@]}" down --timeout 15 || result=1
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
run() {
  "$@" &
  child=$!
  wait "$child"
  child=''
}
echo 'Building and starting the local backend. First launch downloads Docker images and antivirus definitions.'
run "${compose[@]}" build
run "${compose[@]}" up -d postgres redis minio clamav mailpit
run "${compose[@]}" run --rm -T --no-deps web python manage.py prepare_local
run "${compose[@]}" up -d --wait --wait-timeout 90 web worker beat
printf '\nBackend: http://localhost:8000/health/ready/\nLocal email: http://localhost:8025\nPress Ctrl+C to stop all backend containers.\n\n'
run "${compose[@]}" logs --follow --tail 40
