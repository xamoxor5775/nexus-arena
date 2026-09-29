#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker no está instalado o no está disponible en PATH." >&2
  exit 1
fi

docker compose up -d --build
docker compose ps

echo "NEXUS ARENA disponible en: http://localhost:8080"
