#!/usr/bin/env bash
set -euo pipefail

MODEL=gpt-4.1
USE_LOGICLECLOUD=false
REASONING=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  -m, --model MODEL   OpenAI model to use (default: $MODEL)
  -r, --reasoning     Enable reasoning (reasoning.summary=auto)
  --logiclecloud      Use LogicleCloud endpoint and LOGICLECLOUD_API_KEY
  -h, --help          Show this help
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    -m|--model) MODEL=$2; shift 2 ;;
    -r|--reasoning) REASONING=true; shift ;;
    --logiclecloud) USE_LOGICLECLOUD=true; shift ;;
    -h|--help)  usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

if [[ "$USE_LOGICLECLOUD" == "true" ]]; then
  API_URL="https://llmproxy.eu.logicle.ai/openai/v1/responses"
  AUTH_HEADER="Authorization: Bearer $LOGICLECLOUD_API_KEY"
else
  API_URL="https://api.openai.com/v1/responses"
  AUTH_HEADER="Authorization: Bearer $OPENAI_API_KEY"
fi

echo API_URL=$API_URL
echo AUTH_HEADER=$AUTH_HEADER

curl -s "$API_URL" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
    "model": "${MODEL}",
    "input": "Howdy"$(if [[ "$REASONING" == "true" ]]; then
      printf ',\n    "reasoning": {\n        "summary": "auto"\n    }'
    fi),
    "stream": true
}
JSON
