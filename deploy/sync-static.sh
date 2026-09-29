#!/usr/bin/env bash
# Copy the running container's public files to the host so nginx can serve
# /assets, /media, /textures, /models and /sfx directly (see
# deploy/nginx/nexusarena.cl.conf). Run after every `docker compose up -d --build`.
#
#   sudo deploy/sync-static.sh            # container "nexus-arena"
#   sudo deploy/sync-static.sh other-name
#
# Safe to run any time: nginx falls back to Node for any file missing here.
# Old hashed /assets are kept (clients holding an older HTML still find their
# chunks); other folders are mirrored exactly so replaced/removed files update.
set -euo pipefail

CONTAINER="${1:-nexus-arena}"
DEST="${NEXUS_STATIC_DIR:-/var/www/nexus-arena/public}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

docker cp "$CONTAINER:/app/.output/public/." "$STAGE/"
mkdir -p "$DEST"

rsync -a "$STAGE/assets/" "$DEST/assets/"
for dir in media textures models sfx; do
  if [ -d "$STAGE/$dir" ]; then
    rsync -a --delete "$STAGE/$dir/" "$DEST/$dir/"
  fi
done

chmod -R a+rX "$DEST"
echo "static files synced to $DEST"
du -sh "$DEST"
