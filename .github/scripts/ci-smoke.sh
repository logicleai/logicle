#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
COOKIE_JAR="$(mktemp)"

cleanup() {
  rm -f "${COOKIE_JAR}"
}
trap cleanup EXIT

request_json() {
  local method="$1"
  local path="$2"
  local expected_status="$3"
  local body="${4:-}"

  local response_file
  response_file="$(mktemp)"

  local code
  if [ -n "${body}" ]; then
    code="$(curl -sS -o "${response_file}" -w "%{http_code}" \
      -X "${method}" \
      -H "Content-Type: application/json" \
      -H "sec-fetch-site: same-origin" \
      -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" \
      "${BASE_URL}${path}" \
      --data "${body}")"
  else
    code="$(curl -sS -o "${response_file}" -w "%{http_code}" \
      -X "${method}" \
      -H "sec-fetch-site: same-origin" \
      -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" \
      "${BASE_URL}${path}")"
  fi

  if [ "${code}" != "${expected_status}" ]; then
    echo "Request failed: ${method} ${path} -> ${code}, expected ${expected_status}" >&2
    cat "${response_file}" >&2 || true
    rm -f "${response_file}"
    exit 1
  fi

  cat "${response_file}"
  rm -f "${response_file}"
}

json_get() {
  local key="$1"
  node -e '
    const key = process.argv[1];
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => {
      const obj = JSON.parse(data);
      const value = key.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
      if (value === undefined) process.exit(2);
      process.stdout.write(typeof value === "string" ? value : JSON.stringify(value));
    });
  ' "${key}"
}

echo "Smoke: health endpoint"
health_body="$(request_json GET /api/health 200)"
if ! echo "${health_body}" | grep -q '"status":"ok"'; then
  echo "Unexpected /api/health payload: ${health_body}" >&2
  exit 1
fi

echo "Smoke: documentation endpoints"
request_json GET /api/v1 200 >/dev/null
request_json GET /openapi.yaml 200 >/dev/null

echo "Smoke: unauthenticated user endpoint should be rejected"
unauth_code="$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}/api/user/profile")"
if [ "${unauth_code}" != "401" ] && [ "${unauth_code}" != "403" ]; then
  echo "Expected /api/user/profile without auth to return 401/403, got ${unauth_code}" >&2
  exit 1
fi

run_id="$(date +%s)-$RANDOM"
email="smoke-${run_id}@example.com"
password="SmokePassw0rd!"

echo "Smoke: signup + login"
request_json POST /api/auth/join 201 \
  "{\"name\":\"Smoke User\",\"email\":\"${email}\",\"password\":\"${password}\"}" >/dev/null
request_json POST /api/auth/login 204 \
  "{\"email\":\"${email}\",\"password\":\"${password}\"}" >/dev/null

echo "Smoke: authenticated profile read"
profile_body="$(request_json GET /api/user/profile 200)"
user_id="$(echo "${profile_body}" | json_get id)"
if [ -z "${user_id}" ]; then
  echo "Missing user id in profile response" >&2
  exit 1
fi

echo "Smoke: CRUD baseline with folders"
folder_body="$(request_json POST /api/user/folders 201 "{\"name\":\"Smoke Folder ${run_id}\"}")"
folder_id="$(echo "${folder_body}" | json_get id)"
request_json GET "/api/user/folders/${folder_id}" 200 >/dev/null
request_json PATCH "/api/user/folders/${folder_id}" 204 "{\"name\":\"Smoke Folder Updated ${run_id}\"}" >/dev/null
request_json DELETE "/api/user/folders/${folder_id}" 204 >/dev/null

echo "Smoke: setup backend + assistant + conversation"
backend_body="$(request_json POST /api/backends 201 \
  "{\"providerType\":\"openai\",\"name\":\"Smoke Backend ${run_id}\",\"apiKey\":\"user_provided\"}")"
backend_id="$(echo "${backend_body}" | json_get id)"

assistant_body="$(request_json POST /api/assistants 201 \
  "{\"assistantId\":\"\",\"backendId\":\"${backend_id}\",\"description\":\"Smoke assistant\",\"model\":\"gpt-4o-mini\",\"name\":\"Smoke Assistant\",\"systemPrompt\":\"You are a smoke test assistant.\",\"temperature\":0.2,\"tokenLimit\":4096,\"reasoning_effort\":null,\"tags\":[],\"prompts\":[],\"tools\":[],\"files\":[],\"iconUri\":null}")"
assistant_id="$(echo "${assistant_body}" | json_get assistantId)"

conversation_body="$(request_json POST /api/conversations 201 \
  "{\"assistantId\":\"${assistant_id}\",\"name\":\"Smoke Conversation\"}")"
conversation_id="$(echo "${conversation_body}" | json_get id)"

echo "Smoke: chat SSE endpoint returns stream"
chat_response="$(mktemp)"
chat_code="$(curl -sS -o "${chat_response}" -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" \
  "${BASE_URL}/api/chat" \
  --data "{\"id\":\"msg-${run_id}\",\"conversationId\":\"${conversation_id}\",\"parent\":null,\"role\":\"user\",\"content\":\"hello smoke\",\"attachments\":[]}")"

if [ "${chat_code}" != "200" ]; then
  echo "Chat request failed with status ${chat_code}" >&2
  cat "${chat_response}" >&2 || true
  rm -f "${chat_response}"
  exit 1
fi

if ! grep -q 'data:' "${chat_response}"; then
  echo "Chat response did not contain SSE data lines" >&2
  cat "${chat_response}" >&2 || true
  rm -f "${chat_response}"
  exit 1
fi

if ! grep -q '"type":"message"' "${chat_response}"; then
  echo "Chat response did not contain message chunk" >&2
  cat "${chat_response}" >&2 || true
  rm -f "${chat_response}"
  exit 1
fi

rm -f "${chat_response}"
echo "Smoke + baseline integration checks passed."
