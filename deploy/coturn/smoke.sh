#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./smoke.sh [--stun] <turn-dns-name> [plain-port] [tls-port]

Checks DNS, TCP reachability, and a certificate-verified TLS handshake. --stun also sends an
unauthenticated UDP STUN binding request with coturn's official turnutils_stunclient. It never
reads or prints TURN shared secrets and does not prove an authenticated relay allocation.
USAGE
}

with_stun=false
if [[ ${1:-} == "--stun" ]]; then
  with_stun=true
  shift
fi

if [[ $# -lt 1 || $# -gt 3 ]]; then
  usage >&2
  exit 64
fi

host=$1
plain_port=${2:-3478}
tls_port=${3:-5349}
image=${COTURN_IMAGE:-coturn/coturn:4.14.0-r0-debian}

if [[ ! $host =~ ^[A-Za-z0-9.-]+$ ]]; then
  printf 'smoke: invalid TURN DNS name\n' >&2
  exit 64
fi
for port in "$plain_port" "$tls_port"; do
  if [[ ! $port =~ ^[0-9]+$ ]] || ((port < 1 || port > 65535)); then
    printf 'smoke: invalid port %s\n' "$port" >&2
    exit 64
  fi
done

if command -v getent >/dev/null 2>&1; then
  getent ahosts "$host" >/dev/null
elif command -v dscacheutil >/dev/null 2>&1; then
  dscacheutil -q host -a name "$host" | grep -Eq '^ip_address:'
elif command -v host >/dev/null 2>&1; then
  host "$host" >/dev/null
else
  printf 'smoke: no DNS lookup utility found\n' >&2
  exit 69
fi
printf 'smoke: DNS resolves\n'

command -v nc >/dev/null 2>&1 || { printf 'smoke: nc is required\n' >&2; exit 69; }
nc -z -w 5 "$host" "$plain_port"
printf 'smoke: TURN/TCP %s is reachable\n' "$plain_port"

command -v openssl >/dev/null 2>&1 || { printf 'smoke: OpenSSL is required\n' >&2; exit 69; }
openssl_help=$(openssl s_client -help 2>&1 || true)
if [[ $openssl_help != *-verify_hostname* ]]; then
  printf 'smoke: modern OpenSSL with -verify_hostname is required (LibreSSL is insufficient)\n' >&2
  exit 69
fi
openssl s_client \
  -connect "$host:$tls_port" \
  -servername "$host" \
  -verify_hostname "$host" \
  -verify_return_error \
  </dev/null >/dev/null 2>&1
printf 'smoke: TURN/TLS certificate and hostname are valid\n'

if [[ $with_stun == true ]]; then
  command -v docker >/dev/null 2>&1 || { printf 'smoke: Docker is required for --stun\n' >&2; exit 69; }
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    printf 'smoke: image %s is not local; review then pull it explicitly\n' "$image" >&2
    exit 69
  fi
  docker run --rm --entrypoint turnutils_stunclient "$image" -p "$plain_port" "$host" >/dev/null
  printf 'smoke: UDP STUN binding succeeds\n'
fi

printf 'smoke: listener checks passed; forced-relay browser E2E is still required\n'
