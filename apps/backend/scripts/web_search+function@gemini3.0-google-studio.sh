curl --no-buffer \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:streamGenerateContent?alt=sse&key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Today's news and also tell me the current UTC time using the function."
        }
      ]
    }
  ],
  "tools": [
    {
      "googleSearch": {}
    },
    {
      "functionDeclarations": [
        {
          "name": "get_utc_time",
          "description": "Get the current UTC time",
          "parameters": {
            "type": "OBJECT",
            "properties": {}
          }
        }
      ]
    }
  ],
  "toolConfig": {
    "includeServerSideToolInvocations": true
  }
}
JSON