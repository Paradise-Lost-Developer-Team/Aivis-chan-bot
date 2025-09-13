# aivis-tts-proxy

Simple Node/Express proxy that forwards `/api/tts/speakers` and `/api/guilds/:id/speakers` to the internal `aivisspeech-engine` service.

Usage:

1. Install dependencies:

```bash
cd server
npm install
```

1. Run locally (development):

```bash
PORT=3001 node index.js
```

1. In production, run this as a sidecar or as part of your web deployment so that the frontend can call `/api/tts/speakers`  
over HTTPS and the proxy can reach the cluster-internal service by DNS.

Notes:

- The proxy attempts several internal DNS names and localhost fallbacks.
- It does not implement authentication; integrate with your existing session/auth middleware as needed.
- Consider adding caching and rate-limiting for robustness.

Docker (build & push)

1. Build locally:

```bash
cd server
docker build -t aivis-tts-proxy:local -f Dockerfile .
```

1. Tag for GHCR (example):

```bash
docker tag aivis-tts-proxy:local ghcr.io/<ORG>/aivis-tts-proxy:latest
```

1. Push (login to GHCR first):

```bash
echo $CR_PAT | docker login ghcr.io -u <USERNAME> --password-stdin
docker push ghcr.io/<ORG>/aivis-tts-proxy:latest
```

Environment variables

- `ENGINE_HOSTS` (optional): comma-separated list of internal engine hostnames to try (default uses built-in list)
- `PORT`: server port (default 3001)
- `TIMEOUT_MS`: request timeout to engine
- `CACHE_TTL`: cache TTL for speakers

Security

- Serve this proxy behind the same TLS/Ingress as the dashboard so the browser can call `/api/tts/speakers` without mixed-content issues.
- Add authentication/session checks so only authorized users can call the endpoint.
