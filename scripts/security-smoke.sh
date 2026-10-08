#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 BASE_URL" >&2
  exit 2
fi

BASE_URL="${1%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

for command_name in curl jq; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 2
  fi
done

PASS_COUNT=0
FAIL_COUNT=0
RESPONSE_BODY=""
RESPONSE_STATUS=""

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'PASS: %s\n' "$1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL: %s\n' "$1"
}

request() {
  local cookie_jar="$1"
  local method="$2"
  local path="$3"
  shift 3
  local cookie_args=()
  local response

  if [[ -n "$cookie_jar" ]]; then
    cookie_args=(-b "$cookie_jar" -c "$cookie_jar")
  fi

  response="$(curl -sS "${cookie_args[@]}" -X "$method" "$BASE_URL$path" "$@" -w $'\n%{http_code}')"
  RESPONSE_STATUS="${response##*$'\n'}"
  RESPONSE_BODY="${response%$'\n'*}"
}

expect_status() {
  local description="$1"
  local expected="$2"
  if [[ "$RESPONSE_STATUS" == "$expected" ]]; then
    pass "$description ($expected)"
  else
    fail "$description (expected $expected, got $RESPONSE_STATUS): $RESPONSE_BODY"
  fi
}

expect_json() {
  local description="$1"
  local filter="$2"
  if jq -e "$filter" >/dev/null 2>&1 <<<"$RESPONSE_BODY"; then
    pass "$description"
  else
    fail "$description: $RESPONSE_BODY"
  fi
}

login() {
  local cookie_jar="$1"
  local email="$2"
  local password="$3"

  request "$cookie_jar" POST /api/auth/login \
    -H 'Content-Type: application/json' \
    --data "$(jq -cn --arg email "$email" --arg password "$password" '{email: $email, password: $password}')"
  if [[ "$RESPONSE_STATUS" != "200" ]]; then
    echo "Login failed for $email: $RESPONSE_BODY" >&2
    exit 1
  fi
}

create_order() {
  local cookie_jar="$1"
  local recipe_id="$2"
  local roll_id="$3"

  request "$cookie_jar" POST /api/orders \
    -H 'Content-Type: application/json' \
    --data "$(jq -cn \
      --arg recipeId "$recipe_id" \
      --arg fabricRollId "$roll_id" \
      '{recipeId: $recipeId, targetQty: 10, fabricRollId: $fabricRollId, actualFabricYds: 360}')"
  if [[ "$RESPONSE_STATUS" == "201" ]]; then
    pass "supervisor creates $roll_id" >&2
  else
    fail "supervisor creates $roll_id (expected 201, got $RESPONSE_STATUS): $RESPONSE_BODY" >&2
    exit 1
  fi
  jq -er '.order.id' <<<"$RESPONSE_BODY"
}

submit_order() {
  local cookie_jar="$1"
  local order_id="$2"

  request "$cookie_jar" POST "/api/orders/$order_id/submit"
  expect_status "supervisor submits $order_id" 200
}

get_verification_detail() {
  local cookie_jar="$1"
  local order_id="$2"

  request "$cookie_jar" GET "/api/verify/$order_id"
  expect_status "verifier loads $order_id" 200
}

save_counts() {
  local cookie_jar="$1"
  local order_id="$2"
  local counts="$3"

  request "$cookie_jar" POST "/api/verify/$order_id/counts" \
    -H 'Content-Type: application/json' \
    --data "$(jq -cn --argjson counts "$counts" '{counts: $counts}')"
  expect_status "verifier saves counts for $order_id" 200
}

approve_order() {
  local cookie_jar="$1"
  local order_id="$2"
  local body="$3"

  request "$cookie_jar" POST "/api/verify/$order_id/approve" \
    -H 'Content-Type: application/json' \
    --data "$body"
}

SUPERVISOR_JAR="$TMP_DIR/supervisor.jar"
VERIFIER_JAR="$TMP_DIR/verifier.jar"
SEWING_JAR="$TMP_DIR/sewing.jar"

login "$SUPERVISOR_JAR" "supervisor@apparelflow.test" "Demo@12345"
login "$VERIFIER_JAR" "verifier@apparelflow.test" "Demo@12345"
login "$SEWING_JAR" "sewing@apparelflow.test" "Demo@12345"

request "$SUPERVISOR_JAR" GET /api/recipes
expect_status "supervisor loads recipes" 200
RECIPE_ID="$(jq -er '.recipes[0].id' <<<"$RESPONSE_BODY")"

RED_ID="$(create_order "$SUPERVISOR_JAR" "$RECIPE_ID" "SMOKE-RED")"
UNCOUNTED_ID="$(create_order "$SUPERVISOR_JAR" "$RECIPE_ID" "SMOKE-UNC")"
PENDING_ID="$(create_order "$SUPERVISOR_JAR" "$RECIPE_ID" "SMOKE-PENDING")"
VERIFIED_ID="$(create_order "$SUPERVISOR_JAR" "$RECIPE_ID" "SMOKE-VERIFIED")"

submit_order "$SUPERVISOR_JAR" "$RED_ID"
submit_order "$SUPERVISOR_JAR" "$UNCOUNTED_ID"
submit_order "$SUPERVISOR_JAR" "$PENDING_ID"
submit_order "$SUPERVISOR_JAR" "$VERIFIED_ID"

get_verification_detail "$VERIFIER_JAR" "$RED_ID"
RED_COUNTS="$(jq -c '[.order.verificationItems | to_entries[] | {componentId: .value.componentId, actualQty: (if .key == 0 then 0 else .value.expectedQty end)}]' <<<"$RESPONSE_BODY")"
save_counts "$VERIFIER_JAR" "$RED_ID" "$RED_COUNTS"

get_verification_detail "$VERIFIER_JAR" "$UNCOUNTED_ID"
UNCOUNTED_COUNTS="$(jq -c '[.order.verificationItems[0] | {componentId, actualQty: expectedQty}]' <<<"$RESPONSE_BODY")"
save_counts "$VERIFIER_JAR" "$UNCOUNTED_ID" "$UNCOUNTED_COUNTS"

get_verification_detail "$VERIFIER_JAR" "$VERIFIED_ID"
VERIFIED_COUNTS="$(jq -c '[.order.verificationItems[] | {componentId, actualQty: expectedQty}]' <<<"$RESPONSE_BODY")"
save_counts "$VERIFIER_JAR" "$VERIFIED_ID" "$VERIFIED_COUNTS"
approve_order "$VERIFIER_JAR" "$VERIFIED_ID" '{}'
expect_status "verifier approves the all-counted order" 200

# Authorization expectations.
approve_order "$SUPERVISOR_JAR" "$VERIFIED_ID" '{}'
expect_status "supervisor cannot approve" 403

request "$SEWING_JAR" GET /api/verify/orders
expect_status "sewing role cannot read verification orders" 403

request "$VERIFIER_JAR" POST /api/orders \
  -H 'Content-Type: application/json' \
  --data '{}'
expect_status "verifier cannot create cutting orders" 403

request "$VERIFIER_JAR" GET /api/sewing/queue
expect_status "verifier cannot read sewing queue" 403

request "$SUPERVISOR_JAR" GET /api/sewing/queue
expect_status "supervisor cannot read sewing queue" 403

# Protected endpoints reject requests without a session cookie.
request "" GET /api/sewing/queue
expect_status "no cookie on sewing queue" 401

request "" GET /api/sewing/"$PENDING_ID"
expect_status "no cookie on sewing detail" 401

request "" POST /api/sewing/"$VERIFIED_ID"/start \
  -H 'Content-Type: application/json' \
  --data '{}'
expect_status "no cookie on sewing start" 401

request "" POST /api/verify/"$VERIFIED_ID"/approve \
  -H 'Content-Type: application/json' \
  --data '{}'
expect_status "no cookie on verifier approval" 401

# Verification gatekeeper expectations.
approve_order "$VERIFIER_JAR" "$RED_ID" '{}'
expect_status "verifier cannot approve an order with a RED item" 422

approve_order "$VERIFIER_JAR" "$UNCOUNTED_ID" '{}'
expect_status "verifier cannot approve an order with an uncounted item" 422

request "$VERIFIER_JAR" POST "/api/verify/$PENDING_ID/reject" \
  -H 'Content-Type: application/json' \
  --data '{"note":"  "}'
expect_status "verifier rejects whitespace-only note" 422

approve_order "$VERIFIER_JAR" "$VERIFIED_ID" '{"status":"VERIFIED","verifierId":"x"}'
expect_status "approval rejects extra body fields" 422

# Queue ignores query parameters and contains the API-created VERIFIED order, not pending orders.
request "$SEWING_JAR" GET '/api/sewing/queue?status=PENDING_VERIFICATION&all=true'
expect_status "sewing queue ignores status query parameters" 200
expect_json "sewing queue contains the verified order" ".orders | any(.[]; .id == \"$VERIFIED_ID\")"
expect_json "sewing queue excludes the pending order" "(.orders | any(.[]; .id == \"$PENDING_ID\")) | not"
expect_json "sewing queue excludes the red order" "(.orders | any(.[]; .id == \"$RED_ID\")) | not"

request "$SEWING_JAR" GET "/api/sewing/$PENDING_ID"
expect_status "sewing cannot read a pending order by ID" 404

printf '\nSecurity smoke result: %d passed, %d failed\n' "$PASS_COUNT" "$FAIL_COUNT"
if (( FAIL_COUNT > 0 )); then
  exit 1
fi
