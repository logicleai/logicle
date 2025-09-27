curl -s "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
    "contents": [
      {"parts": [{"text": "Explain photosynthesis in simple terms."}]}
    ]
}
JSON
