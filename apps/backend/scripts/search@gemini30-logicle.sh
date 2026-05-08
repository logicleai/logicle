curl -s https://llmproxy.eu.logicle.ai/chat/completions \
  -H "Authorization: Bearer $LOGICLECLOUD_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
    "model": "gemini-3.0-pro",
    "messages": [
      { "role": "user", "content": "Puoi cercare pippo su Internet" }
    ],
    "reasoning_effort": "medium",
    "web_search_options": {
        "search_context_size": "high"
    },
    "stream": true
}
JSON
