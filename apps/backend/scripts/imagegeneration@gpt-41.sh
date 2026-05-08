curl -s https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
    "model": "gpt-4.1",
    "input": "Can you generate an image of an horse low quality",
    "reasoning": {
        "summary": "auto"
    },
    "tools": [
        {
            "type": "image_generation",
            "partial_images": 3
        }
    ],
	  "stream": true
}
JSON
