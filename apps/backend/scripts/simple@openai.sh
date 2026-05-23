#!/usr/bin/env bash
set -euo pipefail

MODEL=gpt-4.1
USE_LOGICLECLOUD=false
REASONING=false
IMAGE_FILE=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  -m, --model MODEL   OpenAI model to use (default: $MODEL)
  -r, --reasoning     Enable reasoning (reasoning.summary=auto)
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
    -r|--reasoning) REASONING=true; shift ;;
    --logiclecloud) USE_LOGICLECLOUD=true; shift ;;
    -i|--image) IMAGE_FILE=$2; shift 2 ;;
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

if [[ -n "$IMAGE_FILE" ]]; then
  IMAGE_DATA=$(base64 -w 0 "$IMAGE_FILE")
  MIME_TYPE=$(file --mime-type -b "$IMAGE_FILE")
  INPUT_JSON=$(jq -n \
    --arg data "$IMAGE_DATA" \
    --arg mime "$MIME_TYPE" \
    '[{role: "user", content: [
        {type: "input_image", image_url: ("data:" + $mime + ";base64," + $data)},
        {type: "input_text",  text: "What do you see in this image?"}
    ]}]')
else
  INPUT_JSON='"Howdy"'
fi

DO_REASONING=false
[[ "$REASONING" == "true" ]] && DO_REASONING=true

PAYLOAD=$(jq -n \
  --arg    model          "$MODEL" \
  --argjson input         "$INPUT_JSON" \
  --argjson do_reasoning  "$DO_REASONING" \
  '{model: $model, input: $input, stream: true}
   + (if $do_reasoning then {reasoning: {summary: "auto"}} else {} end)')

curl -s "$API_URL" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
