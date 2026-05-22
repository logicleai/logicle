#!/usr/bin/env bash
set -euo pipefail

MODEL=claude-sonnet-4-20250514
USE_LOGICLECLOUD=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  -m, --model MODEL   Anthropic model to use (default: $MODEL)
  --logiclecloud      Use LogicleCloud endpoint and LOGICLECLOUD_API_KEY
  -h, --help          Show this help
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    -m|--model) MODEL=$2; shift 2 ;;
    --logiclecloud) USE_LOGICLECLOUD=true; shift ;;
    -h|--help)  usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

if [[ "$USE_LOGICLECLOUD" == "true" ]]; then
  API_URL="https://llmproxy.eu.logicle.ai/v1/messages"
  AUTH_HEADER="Authorization: Bearer $LOGICLECLOUD_API_KEY"
else
  API_URL="https://api.anthropic.com/v1/messages"
  AUTH_HEADER="x-api-key: $ANTHROPIC_API_KEY"
fi

echo API_URL=$API_URL
echo AUTH_HEADER=$AUTH_HEADER

curl -s "$API_URL" \
  -H "$AUTH_HEADER" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  --data-binary @- <<JSON
{
  "model": "${MODEL}",
  "max_tokens": 512,
  "messages": [
    {
      "role": "user",
      "content": "Howdy"
    }
  ]
}
JSON
