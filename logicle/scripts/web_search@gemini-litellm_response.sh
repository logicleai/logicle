curl https://llmproxy.eu.logicle.ai/v1/responses \
  -H "Authorization: Bearer $LOGICLECLOUD_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
    "model": "gemini-2.5-flash",
    "tools": [
        {
            "type": "web_search"
        }
    ],
    "input": "stock exchange news",
    "reasoning": {
        "summary": "auto"
    },
    "include": [
       "web_search_call.action.sources"
    ],
    "reasoning_effort": "low", 
    "thinkingBudget": -1,
	"stream": true
}
JSON
