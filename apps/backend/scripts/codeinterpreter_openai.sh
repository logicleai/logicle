#!/usr/bin/env bash

# Path to your PDF
FILE_PATH=$1

# Read & base64-encode (no line wraps)
FILE_DATA=$(base64 -w 0 "$FILE_PATH")
MIME_TYPE=$(file --mime-type -b $FILE_PATH)

echo key is $OPENAI_API_KEY
echo mime type is $MIME_TYPE

# Make the Responses API call with Code Interpreter enabled
curl https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "model": "o4-mini",
  "tools": [
    {
      "type": "code_interpreter",
      "container": { "type": "auto" }
    }
  ],
  "input": [
    {
      "role": "system",
      "content": "You are a helpful assistant with Python execution capabilities (Code Interpreter)."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "input_file",
          "filename": "$(basename "$FILE_PATH")",
          "file_data": "data:$MIME_TYPE;base64,$FILE_DATA"
        },
        {
          "type": "input_text",
          "text": "Extract statistics about letters in these files"
        }
      ]
    }
  ],
  "stream": true,
  "store": false
}
EOF