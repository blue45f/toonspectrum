# ToonSpectrum coturn data plane

This directory is an **opt-in, single-node Linux deployment scaffold** for Studio voice relay.
The Nest API remains the credential control plane; coturn carries encrypted WebRTC packets when
the browser cannot establish a direct path. The stack does not start as part of `deploy/oci` and
does not change local development.

The configuration matches `StudioVoiceIcePolicyService`: coturn REST credentials use a
`<unix-expiry>:<opaque-identity>` username and `base64(HMAC-SHA1(shared-secret, username))`
password. The shared secret must be identical on the API and this data plane, but must never be
sent to a browser or stored in git.

## Topology and ports

```text
Browser ── UDP/TCP 3478 ─┐
Browser ── TLS/TCP 5349 ─┼─> voice.example.com / static public IP ─> coturn
                         └── UDP 49160-49259 relay allocations ─> public WebRTC peers

Authenticated API ── short-lived ICE policy ─> Browser
                  └── shared secret (server-side only) ─> same value as coturn
```

The official coturn container recommends host networking for relay port ranges. Consequently this
compose file targets a Linux VM, uses `network_mode: host`, and publishes no Docker bridge ports.
The default range has 100 UDP relay ports and the bootstrap rejects an unbounded range.

Open these host firewall and cloud security-list ingress rules:

| Protocol | Port | Purpose |
| --- | ---: | --- |
| UDP | 3478 | STUN and TURN over UDP |
| TCP | 3478 | TURN fallback over TCP |
| TCP | 5349 | TURN over TLS (`turns:`) |
| UDP | 5349 | DTLS listener; optional today, reserved for an audited client policy |
| UDP | 49160–49259 | Allocated WebRTC relay media |

Allow outbound UDP to public WebRTC peers plus the host's DNS, NTP, certificate-renewal, and image
registry dependencies. If `TURN_RELAY_MIN_PORT` or `TURN_RELAY_MAX_PORT` changes, update both the
host firewall and the cloud security list. Never expose coturn CLI, web admin, SQLite, Docker, or a
metrics port publicly.

## Provisioning

1. Create a dedicated `voice.<domain>` DNS **A record** for the static public IPv4 address. This
   scaffold is IPv4-only; do not publish an AAAA record until relay/listener IPv6 has been tested.
2. Obtain a PEM certificate full chain and an **unencrypted** PEM private key whose SAN contains
   that exact DNS name. Keep renewal outside the container and restart coturn after replacing the
   files. Do not mount Caddy's internal storage path directly; copy renewed files with a restricted
   deploy hook instead.
3. Create local runtime directories and a high-entropy base64url secret:

   ```bash
   cd deploy/coturn
   umask 077
   mkdir -p secrets certs
   openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n' > secrets/static-auth-secret
   cp /secure/source/fullchain.pem certs/fullchain.pem
   cp /secure/source/privkey.pem certs/privkey.pem
   chmod 600 secrets/static-auth-secret certs/privkey.pem
   chmod 644 certs/fullchain.pem
   sudo chown root:root secrets/static-auth-secret certs/fullchain.pem certs/privkey.pem
   cp .env.example .env
   ```

4. Edit `.env`. `TURN_REALM` must be the certificate DNS name and `TURN_EXTERNAL_IP` must be the
   static numeric public IP. The bootstrap intentionally refuses example domains, documentation
   IP ranges, empty secrets, weak secrets, unlimited quotas, and invalid port ranges.
5. When the VM owns its public IP directly, leave `TURN_RELAY_IP` empty. Behind simple 1:1 NAT, set
   it to the private interface IP and preserve **identical relay port mappings** through the NAT.
   More complex multi-IP/NAT deployments need an explicit mapping per address and are outside this
   single-node scaffold.
6. Set the API control-plane variables to the same endpoint and current secret:

   ```dotenv
   STUDIO_VOICE_STUN_URLS=stun:voice.example.com:3478
   STUDIO_VOICE_TURN_URLS=turn:voice.example.com:3478?transport=udp,turn:voice.example.com:3478?transport=tcp,turns:voice.example.com:5349?transport=tcp
   STUDIO_VOICE_TURN_SHARED_SECRET=<exact contents of secrets/static-auth-secret>
   STUDIO_VOICE_TURN_REQUIRED=true
   STUDIO_VOICE_TURN_TTL_SECONDS=900
   ```

   The `turn:` TCP URL and `turns:` TLS URL are deliberately separate fallbacks. The API secret is
   a server-only variable and must never use a `VITE_` prefix.
7. Validate and start explicitly:

   ```bash
   docker compose --profile turn --env-file .env config >/dev/null
   docker compose --profile turn --env-file .env up -d
   docker compose --profile turn --env-file .env ps
   docker compose --profile turn --env-file .env logs --tail=50 coturn
   ```

The image tag is pinned rather than `latest`. Review coturn release notes and rebuild in staging
before updating it. For stronger supply-chain controls, pin the reviewed multi-architecture digest
appropriate for the production CPU in the private deployment manifest.

## Security defaults

- `use-auth-secret` is active and no anonymous TURN allocation mode is configured. Anonymous STUN
  binding remains available because the client policy publishes a credential-free `stun:` URL.
- The bootstrap reads current and previous secrets from Compose secret mounts, writes the effective
  config to a mode-0600 tmpfs file, never places a secret in process arguments, and never prints it.
- The container filesystem is read-only. Linux capabilities are dropped except `SETUID`/`SETGID`,
  which coturn needs to drop from bootstrap root to the official `nobody:nogroup` account after it
  has read host-owned TLS and secret files. `no-new-privileges`, a PID limit, and tmpfs runtime
  directories are active.
- RFC 6062 peer-side TCP relay is disabled. This does **not** disable browser-to-TURN TCP or TLS;
  those listener fallbacks stay enabled while WebRTC media allocations use bounded UDP ports.
- Loopback is rejected by coturn's secure default. The template additionally denies private,
  link-local, carrier-grade NAT, multicast, documentation, benchmark, and reserved peer ranges to
  keep a public relay from becoming a path into the VM/VPC.
- CLI, web admin, Prometheus, verbose logging, binding logging, and software version attributes are
  absent. Do not enable them on a public interface without a separate authenticated management
  network and firewall review.

Standalone Docker Compose secrets are file mounts, not a cloud KMS or HSM. Keep the host paths
root-owned and mode 0600, restrict Docker access, encrypt host disks and backups, and use the cloud
secret manager to deliver them in a mature deployment.

## Quotas and observability

Defaults are intentionally conservative for an audio-only, maximum-six-person P2P mesh:

- `user-quota=12`: enough for five peer connections plus short reconnect overlap.
- `total-quota=100`: never greater than the 100-port relay range; the bootstrap enforces this.
- `max-bps=262144`: 256 KiB/s in each direction per session, above normal Opus audio needs.
- `bps-capacity=26214400`: 25 MiB/s aggregate capacity before coturn suppresses excess traffic.

These are admission ceilings, not capacity promises. Alert on health transitions, allocation
rejections, sustained egress, packet loss, host socket exhaustion, disk/log pressure, and cloud
egress cost. Increase the relay range and total quota together only after load testing and capacity
review.

The API HMACs the work/user identity before placing it in the temporary username, but coturn logs
can still contain IP addresses and a timestamped opaque pseudonym. Treat them as security/personal
metadata. The default logs at warning level to stdout and Docker retains at most three 10 MiB files.
Ship only the minimum fields needed, redact usernames/IPs at the collector where policy requires,
apply a short retention period, and never ingest the rendered config, secret mounts, environment,
SDP, ICE credentials, or debug traces.

## Secret and certificate rotation

coturn accepts multiple shared secrets. This scaffold mounts current and previous values to allow
overlap without invalidating credentials already issued by the API:

1. Create `secrets/static-auth-secret.next` and retain the old file.
2. Set `TURN_SHARED_SECRET_PATH` to the new file and `TURN_PREVIOUS_SHARED_SECRET_PATH` to the old
   file, then recreate coturn. It now accepts both while the API still issues the old credential.
3. Change `STUDIO_VOICE_TURN_SHARED_SECRET` on the API to the new value and restart the API.
4. Wait at least `STUDIO_VOICE_TURN_TTL_SECONDS` plus refresh/backoff and clock-skew margin. Confirm
   no old credential is being issued.
5. Point both compose secret paths to the new file, recreate coturn, then securely remove the old
   file according to the host storage policy.

Never put either secret on a command line. A certificate renewal can replace the cert/key files and
recreate coturn without changing the auth secret; run the external smoke check after every renewal.

## Verification

Run the repository checks first:

```bash
pnpm exec vitest run deploy/coturn/scaffold.test.ts
sh -n deploy/coturn/entrypoint.sh
bash -n deploy/coturn/smoke.sh
docker compose --profile turn --env-file deploy/coturn/.env.example -f deploy/coturn/compose.yml config
```

From a machine outside the TURN VM network, verify DNS, TCP and certificate/TLS:

```bash
deploy/coturn/smoke.sh voice.example.com
```

Add `--stun` only after explicitly pulling/reviewing the pinned image; it sends a safe,
unauthenticated UDP STUN binding request and never reads the shared secret. The compose healthcheck
is similarly only a local STUN-listener liveness check.

Neither check proves TURN authentication or end-to-end relay. Production approval still requires
two isolated browsers/networks with `iceTransportPolicy: "relay"`, a selected candidate pair whose
local and remote candidate types are `relay`, and increasing inbound/outbound RTP bytes in
`RTCPeerConnection.getStats()`. Repeat while blocking UDP to prove TCP/TLS fallback, then test
credential refresh, coturn restart, certificate renewal, and Wi-Fi/mobile network changes.

## Deliberate limitations

- One VM is not highly available. A second independent TURN node, distinct failure domain, DNS
  routing, capacity admission, and per-node observation are required before claiming HA.
- This scaffold is IPv4-only and TLS uses 5349. A dedicated host can additionally offer TLS on 443,
  but ToonSpectrum's combined OCI host already reserves 443 for Caddy and cannot share that socket.
- The health/smoke scripts intentionally do not pass a temporary password to `turnutils_uclient`,
  because command arguments and CI logs can expose credentials. Authenticated relay is verified in
  a browser using the API-issued short-lived policy.
- coturn relays encrypted DTLS-SRTP packets but observes connection metadata and consumes public
  bandwidth. It does not turn the six-person P2P mesh into an SFU and does not solve recording,
  moderation, abuse response, or large-room scaling.

## Primary references

- [coturn official Docker image guide](https://github.com/coturn/coturn/blob/master/docker/coturn/README.md)
- [coturn official configuration reference](https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf)
- [coturn `turnserver` reference](https://github.com/coturn/coturn/blob/master/README.turnserver)
- [coturn `turnadmin` reference](https://github.com/coturn/coturn/blob/master/README.turnadmin)
