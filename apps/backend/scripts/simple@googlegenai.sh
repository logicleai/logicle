#!/usr/bin/env bash
set -euo pipefail

MODEL=gemini-3.5-flash
USE_LOGICLECLOUD=false
REASONING_BUDGET=""
REASONING_LEVEL=""
INCLUDE_THOUGHTS=false
STREAM=true

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  -m, --model MODEL       Gemini model to use (default: $MODEL)
  -r, --reasoning N       Set thinking budget tokens (thinkingBudget, for Gemini 2.x models)
  -l, --level LEVEL       Set thinking level (thinkingLevel: minimal|low|medium|high, for Gemini 3.x models)
  --include-thoughts      Add includeThoughts: true to thinkingConfig
  --no-stream             Disable streaming response
  --logiclecloud          Use LogicleCloud Gemini endpoint and LOGICLECLOUD_API_KEY
  -h, --help              Show this help
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    -m|--model) MODEL=$2; shift 2 ;;
    -r|--reasoning) REASONING_BUDGET=$2; shift 2 ;;
    -l|--level) REASONING_LEVEL=$2; shift 2 ;;
    --include-thoughts) INCLUDE_THOUGHTS=true; shift ;;
    --no-stream) STREAM=false; shift ;;
    --logiclecloud) USE_LOGICLECLOUD=true; shift ;;
    -h|--help)  usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

if [[ -n "$REASONING_BUDGET" && ! "$REASONING_BUDGET" =~ ^[0-9]+$ ]]; then
  echo "Invalid --reasoning value: $REASONING_BUDGET (must be a non-negative integer)" >&2
  exit 1
fi

if [[ -n "$REASONING_BUDGET" && -n "$REASONING_LEVEL" ]]; then
  echo "Cannot use both --reasoning and --level at the same time" >&2
  exit 1
fi

if [[ "$USE_LOGICLECLOUD" == "true" ]]; then
  if [[ "$STREAM" == "true" ]]; then
    API_URL="https://llmproxy.eu.logicle.ai/gemini/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=$LOGICLECLOUD_API_KEY"
  else
    API_URL="https://llmproxy.eu.logicle.ai/gemini/v1beta/models/${MODEL}:generateContent?key=$LOGICLECLOUD_API_KEY"
  fi
else
  if [[ "$STREAM" == "true" ]]; then
    API_URL="https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=$GEMINI_API_KEY"
  else
    API_URL="https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=$GEMINI_API_KEY"
  fi
fi

build_thinking_config() {
  # includeThoughts defaults to true whenever reasoning is configured
  local effective_include_thoughts="$INCLUDE_THOUGHTS"
  [[ -n "$REASONING_BUDGET" || -n "$REASONING_LEVEL" ]] && effective_include_thoughts=true

  local include_thoughts_field=""
  [[ "$effective_include_thoughts" == "true" ]] && include_thoughts_field=', "includeThoughts": true'

  if [[ -n "$REASONING_BUDGET" ]]; then
    printf '{"thinkingBudget": %s%s}' "$REASONING_BUDGET" "$include_thoughts_field"
  elif [[ -n "$REASONING_LEVEL" ]]; then
    printf '{"thinkingLevel": "%s"%s}' "$REASONING_LEVEL" "$include_thoughts_field"
  elif [[ "$INCLUDE_THOUGHTS" == "true" ]]; then
    printf '{"includeThoughts": true}'
  fi
}

THINKING_CONFIG=$(build_thinking_config)

curl -s "$API_URL" \
  -H "Content-Type: application/json" \
  --data-binary @- <<JSON
{
    "contents": [
      {"parts": [{"text": "Explain photosynthesis in simple terms."}]}
    ]$(if [[ -n "$THINKING_CONFIG" ]]; then
      printf ',\n    "generationConfig": {\n      "thinkingConfig": %s\n    }' "$THINKING_CONFIG"
    fi)
}
JSON
