# ADR 0001: Use Hono + Claude Code Headless

**Status:** Accepted | **Date:** 2026-06-14 | **Deciders:** Lee Juhyun

## Context

anomalyco/opencode provides the server backend for OpenTUI. We replace it with Claude Code headless while keeping OpenTUI working without modification.

## Decision

1. **Hono** — lightweight, Bun-native, TypeScript-first. Effect-TS HttpApi (used by OpenCode) wraps Hono internally, so OpenTUI HTTP client works unchanged.

2. **Claude Code headless** (stream-json) as LLM backend. Spawn as child process, capture NDJSON, map to OpenCode event format.

3. **In-memory store** for Phase 1. SQLite planned for Phase 2.

4. **Bun** runtime — fast startup, native TypeScript.

## Consequences

- Positive: Minimal deps (just Hono). Claude Code handles all tool execution.
- Negative: No session persistence across restarts (until Phase 2).
- Risk: Claude Code auth must be pre-configured on host machine.

## Alternatives Considered

- Go + net/http: More heavyweight. Rejected — Bun lighter, TypeScript fits JSON/SSE better.
- Effect-TS mirror: Over-engineering for Phase 1. Rejected.
- Python + Flask: Slower startup. Rejected.
