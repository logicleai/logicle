curl -s https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
    "model": "gpt-4.1",
    "input": "Howdy",
    "reasoning": {
        "summary": "auto"
    },
	"stream": true
}
JSON
