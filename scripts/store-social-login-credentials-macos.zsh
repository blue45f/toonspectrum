#!/bin/zsh
set -euo pipefail

readonly SERVICE_PREFIX="toonstudio"
readonly DEFAULT_VAULT="${HOME}/.config/toonstudio/secrets/oauth-production.env"
readonly -a REQUIRED_KEYS=(
  KAKAO_REST_API_KEY
  KAKAO_CLIENT_SECRET
  NAVER_OAUTH_CLIENT_ID
  NAVER_OAUTH_CLIENT_SECRET
  GITHUB_OAUTH_CLIENT_ID
  GITHUB_OAUTH_CLIENT_SECRET
)

usage() {
  cat <<'TEXT'
Usage:
  scripts/store-social-login-credentials-macos.zsh [vault-file]
  scripts/store-social-login-credentials-macos.zsh --status

Imports the six production social-login credentials into macOS Keychain using
service names such as toonstudio:KAKAO_REST_API_KEY. Values are never printed.
TEXT
}

require_macos_keychain() {
  if [[ "$(uname -s)" != "Darwin" ]] || ! command -v security >/dev/null 2>&1; then
    print -u2 "macOS Keychain and the security command are required"
    exit 1
  fi
}

keychain_status() {
  local missing=0 key
  for key in "${REQUIRED_KEYS[@]}"; do
    if security find-generic-password \
      -a "$USER" \
      -s "${SERVICE_PREFIX}:${key}" \
      >/dev/null 2>&1; then
      print -- "${key}: present"
    else
      print -- "${key}: missing"
      missing=1
    fi
  done
  return "$missing"
}

validate_vault() {
  local vault="$1"
  [[ -f "$vault" ]] || { print -u2 "vault file not found: $vault"; exit 1; }
  [[ ! -L "$vault" ]] || { print -u2 "vault file must not be a symbolic link"; exit 1; }

  local owner mode
  owner="$(stat -f '%Su' "$vault")"
  mode="$(stat -f '%Lp' "$vault")"
  [[ "$owner" == "$USER" ]] || {
    print -u2 "vault file must be owned by $USER"
    exit 1
  }
  (( (8#$mode & 8#077) == 0 )) || {
    print -u2 "vault file must not grant group or world permissions (recommended: chmod 600)"
    exit 1
  }
}

import_vault() {
  local vault="$1" line key value
  typeset -A values

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" == \#* || "$line" != *"="* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      KAKAO_REST_API_KEY|KAKAO_CLIENT_SECRET|NAVER_OAUTH_CLIENT_ID|NAVER_OAUTH_CLIENT_SECRET|GITHUB_OAUTH_CLIENT_ID|GITHUB_OAUTH_CLIENT_SECRET)
        values[$key]="$value"
        ;;
    esac
  done < "$vault"

  for key in "${REQUIRED_KEYS[@]}"; do
    value="${values[$key]:-}"
    [[ -n "$value" ]] || {
      print -u2 "vault is missing a value for $key"
      exit 1
    }
  done

  for key in "${REQUIRED_KEYS[@]}"; do
    security add-generic-password \
      -U \
      -a "$USER" \
      -s "${SERVICE_PREFIX}:${key}" \
      -w "${values[$key]}" \
      >/dev/null
    print -- "${key}: stored"
  done
}

main() {
  require_macos_keychain

  # npm-style invocations may forward a literal separator (`--`) as argv[1].
  # Accept both `pnpm run <script> --status` and `pnpm run <script> -- --status`
  # so the documented status check can never be mistaken for a vault path.
  if [[ "${1:-}" == "--" ]]; then
    shift
  fi
  if (( $# > 1 )); then
    usage >&2
    exit 64
  fi

  case "${1:-}" in
    -h|--help)
      usage
      ;;
    --status)
      keychain_status
      ;;
    *)
      local vault="${1:-$DEFAULT_VAULT}"
      validate_vault "$vault"
      import_vault "$vault"
      keychain_status
      ;;
  esac
}

main "$@"
