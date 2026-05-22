#!/usr/bin/env bash
set -euo pipefail

MODEL=gemini-3.5-flash

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  -m, --model MODEL   Gemini model to use (default: $MODEL)
  -h, --help          Show this help
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    -m|--model) MODEL=$2; shift 2 ;;
    -h|--help)  usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

curl -s https://llmproxy.eu.logicle.ai/chat/completions \
  -H "Authorization: Bearer $LOGICLECLOUD_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
    "model": "${MODEL}",
    "messages": [
      { "role": "user", "content": "ciao" }
    ],
    "reasoning_effort": "none",
    "stream": true
}
JSON
