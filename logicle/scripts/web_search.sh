curl https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
    "model": "gpt-5",
    "tools": [
        {
            "type": "web_search_preview"
        }
    ],
    "input": "How can I show reasoning and tool calls step in openai?",
    "reasoning": {
        "summary": "auto"
    },
	"stream": true
}
JSON
