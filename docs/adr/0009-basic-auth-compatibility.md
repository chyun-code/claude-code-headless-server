# ADR 0009 — Basic Auth Compatibility

**Status:** Accepted (2026-06-14)

## Context

OpenCode's daemon always sends an `Authorization: Basic ...` header to the
registered server when a password file exists. If our server does not validate
that header, the OpenCode daemon health check fails with 401, and OpenTUI
never connects.

The auth format is:

```
Authorization: Basic base64("opencode:password")
```

## Decision

**Add optional Basic Auth middleware, enabled only when
`OPENCODE_SERVER_PASSWORD` is set.**

- Username defaults to `opencode`; override with `OPENCODE_SERVER_USERNAME`.
- Middleware runs after CORS and before route handlers.
- If the header is missing or does not match, return 401 with
  `{ error: "unauthorized" }`.
- Preflight `OPTIONS` requests are not challenged.
- When no password is configured, the server remains open (backward compatible
  with existing local-only use cases).

## Consequences

- OpenCode daemon can authenticate to our server.
- Local users who do not set `OPENCODE_SERVER_PASSWORD` see no behavior change.
- Password is supplied via environment variable so it never appears in shell
  history or process listings.

## References

- ADR 0008 — OpenCode Daemon Registration
- OpenCode source: `packages/server/src/auth.ts`
