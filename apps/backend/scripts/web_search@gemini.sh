curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
    "contents": [
      {"parts": [{"text": "Stock news."}]}
    ],
    "tools": [
      { "google_search": {} }
    ]
}
JSON
