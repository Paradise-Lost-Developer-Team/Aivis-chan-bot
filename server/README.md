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
