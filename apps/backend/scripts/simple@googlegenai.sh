#!/usr/bin/env bash
set -euo pipefail

MODEL=gemini-3.5-flash
USE_LOGICLECLOUD=false
REASONING_BUDGET=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  -m, --model MODEL   Gemini model to use (default: $MODEL)
  -r, --reasoning N   Set Gemini thinking budget tokens (generationConfig.thinkingConfig.thinkingBudget)
  --logiclecloud      Use LogicleCloud Gemini endpoint and LOGICLECLOUD_API_KEY
  -h, --help          Show this help
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    -m|--model) MODEL=$2; shift 2 ;;
    -r|--reasoning) REASONING_BUDGET=$2; shift 2 ;;
    --logiclecloud) USE_LOGICLECLOUD=true; shift ;;
    -h|--help)  usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

if [[ -n "$REASONING_BUDGET" && ! "$REASONING_BUDGET" =~ ^[0-9]+$ ]]; then
  echo "Invalid --reasoning value: $REASONING_BUDGET (must be a non-negative integer)" >&2
  exit 1
fi

if [[ "$USE_LOGICLECLOUD" == "true" ]]; then
  API_URL="https://llmproxy.eu.logicle.ai/gemini/v1beta/models/${MODEL}:generateContent?key=$LOGICLECLOUD_API_KEY"
else
  API_URL="https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=$GEMINI_API_KEY"
fi

curl -s "$API_URL" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
    "contents": [
      {"parts": [{"text": "Explain photosynthesis in simple terms."}]}
    ]$(if [[ -n "$REASONING_BUDGET" ]]; then
      printf ',\n    "generationConfig": {\n      "thinkingConfig": {\n        "thinkingBudget": %s,\n        "includeThoughts": true\n      }\n    }' "$REASONING_BUDGET"
    fi)
}
JSON
