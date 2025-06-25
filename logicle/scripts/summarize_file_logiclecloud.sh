#!/usr/bin/env bash

# Path to your PDF
FILE_PATH=$1

# Read & base64-encode (no line wraps)
FILE_DATA=$(base64 -w 0 "$FILE_PATH")
MIME_TYPE=$(file --mime-type -b $FILE_PATH)

echo key is $LOGICLECLOUD_API_KEY
echo mime type is $MIME_TYPE

# Make the API call
curl https://llmproxy.eu.logicle.ai/v1/responses \
  -H "Authorization: Bearer $LOGICLECLOUD_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "model": "o4-mini",
  "input": [
    {
      "role": "system",
      "content": "You have received an inline PDF."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "input_file",
          "filename": "$(basename "$FILE_PATH")",
          "file_data": "data:$MIME_TYPE;base64,${FILE_DATA}"
        },
        {
          "type": "input_text",
          "text": "Please summarize this PDF. If there are images in the PDF, let me know, and attach the images"
        }
      ]
    }
  ],
  "stream": false,
  "store": false
}
EOF