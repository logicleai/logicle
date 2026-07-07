#!/usr/bin/env bash
set -euo pipefail

MODEL=sonar-pro
USE_LOGICLECLOUD=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  -m, --model MODEL   Perplexity model to use (default: $MODEL)
  --logiclecloud      Use LogicleCloud endpoint and LOGICLECLOUD_API_KEY
  -h, --help          Show this help

Examples:
  $(basename "$0")
  $(basename "$0") --model sonar
  $(basename "$0") --logiclecloud
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    -m|--model) MODEL=$2; shift 2 ;;
    --logiclecloud) USE_LOGICLECLOUD=true; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

if [[ "$USE_LOGICLECLOUD" == "true" ]]; then
  API_URL="https://llmproxy.eu.logicle.ai/v1/chat/completions"
  AUTH_HEADER="Authorization: Bearer $LOGICLECLOUD_API_KEY"
else
  API_URL="https://api.perplexity.ai/v1/sonar"
  AUTH_HEADER="Authorization: Bearer $PERPLEXITY_API_KEY"
fi

case "$AUTH_HEADER" in
  "Authorization: Bearer " | "Authorization: Bearer")
    echo "Missing API key for selected endpoint" >&2
    exit 1
    ;;
esac

echo API_URL=$API_URL
echo AUTH_HEADER=$AUTH_HEADER

PAYLOAD=$(jq -n \
  --arg model "$MODEL" \
  '{model: $model, messages: [{role: "user", content: "Notizie di oggi"}], stream: true}')

curl -sS --no-buffer --fail-with-body "$API_URL" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
