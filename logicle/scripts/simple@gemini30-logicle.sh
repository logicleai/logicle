curl -s https://llmproxy.eu.logicle.ai/chat/completions \
  -H "Authorization: Bearer $LOGICLECLOUD_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
    "model": "gemini-3.0-pro",
    "messages": [
      { "role": "user", "content": "ciao" }
    ],
    "reasoning_effort": "medium",
    "stream": true
}
JSON
