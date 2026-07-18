#!/bin/sh
set -eu

fail() {
  printf 'coturn bootstrap: %s\n' "$1" >&2
  exit 78
}

require_file() {
  [ -f "$2" ] && [ -r "$2" ] && [ -s "$2" ] || fail "$1 file is missing, unreadable, or empty"
}

require_uint() {
  name=$1
  value=$2
  minimum=$3
  maximum=$4

  case "$value" in
    ''|*[!0-9]*) fail "$name must be an integer" ;;
  esac
  [ "${#value}" -le 9 ] || fail "$name is outside the supported range"
  [ "$value" -ge "$minimum" ] && [ "$value" -le "$maximum" ] ||
    fail "$name must be between $minimum and $maximum"
}

is_ipv4() (
  address=$1
  case "$address" in
    *[!0-9.]*|'') return 1 ;;
  esac

  old_ifs=$IFS
  IFS=.
  set -- $address
  IFS=$old_ifs
  [ "$#" -eq 4 ] || return 1

  for octet in "$@"; do
    # Reject ambiguous leading-zero forms as well as empty or oversized octets.
    case "$octet" in
      0|[1-9]|[1-9][0-9]|[1-9][0-9][0-9]) ;;
      *) return 1 ;;
    esac
    [ "$octet" -le 255 ] || return 1
  done
)

is_public_ipv4() (
  address=$1
  is_ipv4 "$address" || return 1

  old_ifs=$IFS
  IFS=.
  set -- $address
  IFS=$old_ifs
  first=$1
  second=$2
  third=$3

  # IANA special-use/non-public ranges that must not be advertised as a relay address.
  case "$first" in
    0|10|127|224|225|226|227|228|229|230|231|232|233|234|235|236|237|238|239|24[0-9]|25[0-5])
      return 1
      ;;
  esac
  [ "$first" -ne 100 ] || { [ "$second" -lt 64 ] || [ "$second" -gt 127 ]; } || return 1
  [ "$first" -ne 169 ] || [ "$second" -ne 254 ] || return 1
  [ "$first" -ne 172 ] || { [ "$second" -lt 16 ] || [ "$second" -gt 31 ]; } || return 1
  if [ "$first" -eq 192 ]; then
    [ "$second" -ne 168 ] || return 1
    [ "$second" -ne 0 ] || [ "$third" -ne 0 ] || return 1
    [ "$second" -ne 0 ] || [ "$third" -ne 2 ] || return 1
    [ "$second" -ne 88 ] || [ "$third" -ne 99 ] || return 1
  fi
  [ "$first" -ne 198 ] || { [ "$second" -ne 18 ] && [ "$second" -ne 19 ]; } || return 1
  [ "$first" -ne 198 ] || [ "$second" -ne 51 ] || [ "$third" -ne 100 ] || return 1
  [ "$first" -ne 203 ] || [ "$second" -ne 0 ] || [ "$third" -ne 113 ] || return 1
)

read_secret() {
  secret_path=$1
  secret_lines=$(awk 'END { print NR }' "$secret_path")
  [ "$secret_lines" -le 1 ] || fail "TURN shared secret must contain exactly one line"

  secret_value=$(tr -d '\r\n' < "$secret_path")
  case "$secret_value" in
    ''|*[!A-Za-z0-9_-]*) fail "TURN shared secret must be base64url-safe" ;;
  esac
  [ "${#secret_value}" -ge 32 ] && [ "${#secret_value}" -le 128 ] ||
    fail "TURN shared secret must be between 32 and 128 characters"

  printf '%s' "$secret_value"
}

realm=${TURN_REALM:-}
external_ip=${TURN_EXTERNAL_IP:-}
relay_ip=${TURN_RELAY_IP:-}
listen_port=${TURN_LISTEN_PORT:-3478}
tls_listen_port=${TURN_TLS_LISTEN_PORT:-5349}
relay_min_port=${TURN_RELAY_MIN_PORT:-49160}
relay_max_port=${TURN_RELAY_MAX_PORT:-49259}
user_quota=${TURN_USER_QUOTA:-12}
total_quota=${TURN_TOTAL_QUOTA:-100}
max_bps=${TURN_MAX_BPS:-262144}
bps_capacity=${TURN_BPS_CAPACITY:-26214400}
log_min_level=${TURN_LOG_MIN_LEVEL:-warning}

secret_file=${TURN_SHARED_SECRET_FILE:-/run/secrets/turn_shared_secret}
previous_secret_file=${TURN_PREVIOUS_SHARED_SECRET_FILE:-$secret_file}
cert_file=${TURN_TLS_CERT_FILE:-/run/secrets/turn_tls_cert}
key_file=${TURN_TLS_KEY_FILE:-/run/secrets/turn_tls_key}
template_file=${TURN_CONFIG_TEMPLATE:-/etc/coturn/turnserver.conf.template}
output_file=${TURN_CONFIG_OUTPUT:-/run/coturn/turnserver.conf}
server_binary=${TURN_SERVER_BINARY:-turnserver}

case "$realm" in
  ''|.*|*.|*..*|*[!A-Za-z0-9.-]*|localhost|*.localhost|example.com|*.example.com)
    fail "TURN_REALM must be the deployed certificate DNS name"
    ;;
esac

is_public_ipv4 "$external_ip" || fail "TURN_EXTERNAL_IP must be a canonical public IPv4 address"
if [ -n "$relay_ip" ]; then
  is_ipv4 "$relay_ip" || fail "TURN_RELAY_IP must be empty or a canonical IPv4 interface address"
fi

require_uint TURN_LISTEN_PORT "$listen_port" 1024 65535
require_uint TURN_TLS_LISTEN_PORT "$tls_listen_port" 1024 65535
[ "$listen_port" -ne "$tls_listen_port" ] || fail "plain and TLS listener ports must differ"
require_uint TURN_RELAY_MIN_PORT "$relay_min_port" 1024 65535
require_uint TURN_RELAY_MAX_PORT "$relay_max_port" 1024 65535
[ "$relay_min_port" -le "$relay_max_port" ] || fail "TURN relay port range is reversed"
relay_port_count=$((relay_max_port - relay_min_port + 1))
[ "$relay_port_count" -ge 32 ] && [ "$relay_port_count" -le 4096 ] ||
  fail "TURN relay port range must contain between 32 and 4096 ports"

require_uint TURN_USER_QUOTA "$user_quota" 1 4096
require_uint TURN_TOTAL_QUOTA "$total_quota" 1 65535
[ "$user_quota" -le "$total_quota" ] || fail "TURN_USER_QUOTA cannot exceed TURN_TOTAL_QUOTA"
[ "$total_quota" -le "$relay_port_count" ] ||
  fail "TURN_TOTAL_QUOTA cannot exceed the available relay port count"
require_uint TURN_MAX_BPS "$max_bps" 32768 100000000
require_uint TURN_BPS_CAPACITY "$bps_capacity" "$max_bps" 999999999

case "$log_min_level" in
  info|warning|error) ;;
  *) fail "TURN_LOG_MIN_LEVEL must be info, warning, or error" ;;
esac

require_file "TURN shared secret" "$secret_file"
require_file "previous TURN shared secret" "$previous_secret_file"
require_file "TLS certificate" "$cert_file"
require_file "TLS private key" "$key_file"
require_file "coturn config template" "$template_file"
command -v "$server_binary" >/dev/null 2>&1 || fail "turnserver binary is unavailable"

current_secret=$(read_secret "$secret_file")
previous_secret=$(read_secret "$previous_secret_file")

output_dir=${output_file%/*}
[ "$output_dir" != "$output_file" ] || output_dir=.
mkdir -p "$output_dir"
umask 077
cp "$template_file" "$output_file"

if [ -n "$relay_ip" ]; then
  advertised_ip="$external_ip/$relay_ip"
else
  advertised_ip=$external_ip
fi

{
  printf '\n# Validated deployment values appended by entrypoint.sh.\n'
  printf 'realm=%s\n' "$realm"
  printf 'server-name=%s\n' "$realm"
  printf 'external-ip=%s\n' "$advertised_ip"
  [ -z "$relay_ip" ] || printf 'relay-ip=%s\n' "$relay_ip"
  printf 'listening-port=%s\n' "$listen_port"
  printf 'tls-listening-port=%s\n' "$tls_listen_port"
  printf 'min-port=%s\n' "$relay_min_port"
  printf 'max-port=%s\n' "$relay_max_port"
  printf 'user-quota=%s\n' "$user_quota"
  printf 'total-quota=%s\n' "$total_quota"
  printf 'max-bps=%s\n' "$max_bps"
  printf 'bps-capacity=%s\n' "$bps_capacity"
  printf 'log-min-level=%s\n' "$log_min_level"
  printf 'cert=%s\n' "$cert_file"
  printf 'pkey=%s\n' "$key_file"
  printf 'static-auth-secret=%s\n' "$current_secret"
  if [ "$previous_secret" != "$current_secret" ]; then
    printf 'static-auth-secret=%s\n' "$previous_secret"
  fi
} >> "$output_file"

chmod 600 "$output_file"
unset current_secret previous_secret

if [ "${TURN_RENDER_ONLY:-false}" = "true" ]; then
  printf 'coturn bootstrap: validated configuration rendered\n'
  exit 0
fi

exec "$server_binary" -c "$output_file"
