#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-logicle:dev}"
DATA_DIR="${DATA_DIR:-$PWD/.podman-data}"

mkdir -p "$DATA_DIR/sqlite" "$DATA_DIR/files"

podman build -f Dockerfile -t "$IMAGE_NAME" ..
podman run -it --rm \
  --name logicle-app-dev \
  --userns=keep-id \
  --env-file logicle/.env.local \
  -p 3000:3000 \
  -v "$DATA_DIR:/data:Z" \
  "$IMAGE_NAME"
