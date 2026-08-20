#!/usr/bin/env bash
set -euo pipefail

# Usage: ./refund-order-full.sh <order_id> [dev|qa]
# Token: set ADMINTOOL_TOKEN env var, or save it to ~/.admintool_token (chmod 600)

ORDER_ID="${1:?Usage: $0 <order_id> [dev|qa]}"
ENV="${2:-dev}"
TOKEN_FILE="${ADMINTOOL_TOKEN_FILE:-$HOME/.admintool_token}"

case "$ENV" in
  dev) BASE_URL="https://apid-backend.ticketmelon.com" ;;
  qa)  BASE_URL="https://apid-frontend.ticketmelon.com" ;;
  *) echo "Unknown env: $ENV (use dev or qa)" >&2; exit 1 ;;
esac

if [ -z "${ADMINTOOL_TOKEN:-}" ] && [ -f "$TOKEN_FILE" ]; then
  ADMINTOOL_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
fi

: "${ADMINTOOL_TOKEN:?No token found. Set ADMINTOOL_TOKEN env var, or save one to $TOKEN_FILE}"

curl -sS -X POST \
  "${BASE_URL}/v1/admintool/order/${ORDER_ID}/refund/full" \
  -H "Content-Type: application/json" \
  -H "authorization: Bearer ${ADMINTOOL_TOKEN}" \
  -d '{
    "collectionFee": false,
    "donation": false,
    "installment": false,
    "passOn": true,
    "paymentGateWayFee": false,
    "refundProtect": false,
    "shipping": false,
    "voucher": false,
    "type": "refund"
  }'
