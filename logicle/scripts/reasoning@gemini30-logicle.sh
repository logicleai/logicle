curl -s https://llmproxy.eu.logicle.ai/chat/completions \
  -H "Authorization: Bearer $LOGICLECLOUD_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
    "model": "gemini-3.0-pro",
    "messages": [
      { "role": "user", "content": "Puoi cercare pippo su Internet" }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "GetFile",
          "description": "Get the content of a knowledge file by its ID",
          "parameters": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "description": "The unique identifier of the file to retrieve"
              }
            },
            "required": ["id"],
            "additionalProperties": false
          }
        }
      }
    ],
    "reasoning_effort": "medium",
    "stream": true,
    "tool_choice": "auto"
}
JSON
