curl https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
    "model": "gpt-5.1",
    "tools": [
        {
            "type": "web_search"
        }
    ],
    "input": "How can I show reasoning and tool calls step in openai?",
    "reasoning": {
        "summary": "auto"
    },
    "include": [
       "web_search_call.action.sources"
    ],
	"stream": true
}
JSON
