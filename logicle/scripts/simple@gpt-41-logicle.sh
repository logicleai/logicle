curl -s https://llmproxy.eu.logicle.ai/v1/responses \
  -H "Authorization: Bearer $LOGICLECLOUD_API_KEY" \
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
