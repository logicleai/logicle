#!/usr/bin/env bash
set -euo pipefail

MODEL=claude-sonnet-4-6
USE_LOGICLECLOUD=false
IMAGE_FILE=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  -m, --model MODEL   Anthropic model to use (default: $MODEL)
  --logiclecloud      Use LogicleCloud endpoint and LOGICLECLOUD_API_KEY
  -i, --image FILE    Include an image in the message (JPEG/PNG)
  -h, --help          Show this help

Test image:
  curl -Lo /tmp/test.jpg 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/1280px-Fronalpstock_big.jpg'
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    -m|--model) MODEL=$2; shift 2 ;;
    --logiclecloud) USE_LOGICLECLOUD=true; shift ;;
    -i|--image) IMAGE_FILE=$2; shift 2 ;;
    -h|--help)  usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

if [[ "$USE_LOGICLECLOUD" == "true" ]]; then
  API_URL="https://llmproxy.eu.logicle.ai/anthropic/v1/messages"
  AUTH_HEADER="Authorization: Bearer $LOGICLECLOUD_API_KEY"
else
  API_URL="https://api.anthropic.com/v1/messages"
  AUTH_HEADER="x-api-key: $ANTHROPIC_API_KEY"
fi

echo API_URL=$API_URL
echo AUTH_HEADER=$AUTH_HEADER

if [[ -n "$IMAGE_FILE" ]]; then
  IMAGE_DATA=$(base64 -w 0 "$IMAGE_FILE")
  MIME_TYPE=$(file --mime-type -b "$IMAGE_FILE")
  PAYLOAD=$(jq -n \
    --arg model "$MODEL" \
    --arg data  "$IMAGE_DATA" \
    --arg mime  "$MIME_TYPE" \
    '{model: $model, max_tokens: 512, messages: [{role: "user", content: [
        {type: "image", source: {type: "base64", media_type: $mime, data: $data}},
        {type: "text",  text:  "What do you see in this image?"}
    ]}]}')
else
  PAYLOAD=$(jq -n --arg model "$MODEL" \
    '{model: $model, max_tokens: 512, messages: [{role: "user", content: "Howdy"}]}')
fi

curl -s "$API_URL" \
  -H "$AUTH_HEADER" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$PAYLOAD"
