# Phase 2 Plan: OpenTUI Integration

**Branch:** `phase-2` (off main)  
**Goal:** OpenTUI connects to Claude Code Headless Server. Same UI behavior as OpenCode Hono server.

## 반증 기준 (from Goal)

1. OpenTUI를 우리 서버에 연결하고 OpenCode 서버와 나란히 놓은 뒤,
   동일한 프롬프트 입력 시 **동일한 응답 스트리밍, 도구 실행 표시, UI 동작**을 보일 것
2. OpenTUI는 **백엔드가 무엇인지 구분하지 못할 것** — 바이너리 교체 외 OpenTUI 코드 수정 없음

## Phase 2 Steps

### Step 1 — PTY WebSocket with Real Terminal Emulation
- **Issue:** #3
- **Deliverable:** `GET /api/pty/:id/connect` WebSocket that spawns bash in a real PTY
- **Verify:** Send keystrokes via WS, receive terminal output with ANSI sequences
- **Tech:** `node-pty` (npm) or Bun-native PTY if available; fallback: `script -q /dev/null bash`
- **Files:** `src/routes/pty.ts`, `src/routes/pty-proxy.ts`

### Step 2 — Slash Command Passthrough
- **Issue:** #8
- **Deliverable:** OpenTUI slash commands translated to Claude Code equivalents
- **Verify:** `/model`, `/compact`, `/resume` sent via OpenTUI → Claude processes correctly
- **Mapping:**
  - `/model <name>` → store in session, next spawn uses `--model <name>`
  - `/compact` → run Claude with compact prompt, capture compacted context
  - `/resume <id>` → update session's `claudeSessionId`
  - `/permission-mode <mode>` → `PATCH /api/session/:id`
  - `/help`, `/agents`, `/skills` → relay to Claude and capture output
- **Files:** `src/routes/session.ts` (add slash command handling)

### Step 3 — OpenTUI Connectivity Test
- **Issue:** new
- **Deliverable:** `opencode --claude-code` points to our server, OpenTUI renders correctly
- **Verify:**
  1. OpenTUI connects to `localhost:4096`
  2. Terminal pane shows PTY session
  3. Chat input sends prompt → SSE events render in chat pane
  4. Tool calls visible in real-time
  5. Permission mode switch in OpenTUI changes Claude behavior
- **Integration points:** OpenTUI config/CLI flag to override backend URL

### Step 4 — v0.2.0 Release
- Merge `phase-2` → `main` (no-ff)
- Tag `v0.2.0`
- Update README: remove 🚧, update API table, add integration screenshot

## NOT in Phase 2

- SQLite persistence (Phase 3)
- Multi-session orchestration (Phase 3)
- Web search, browser tools proxy (Phase 3)
- Claude Code session fork (`--fork-session`) (Phase 3)

## Progress

| Step | Status | Commit |
|------|--------|--------|
| PTY WebSocket | ✅ Done | 5429573 |
| Slash Commands | ✅ Done | fda9f6f |
| OpenTUI Test | 🔜 Ready | Issue #10 |
| v0.2.0 Release | 🔜 Pending test | - |
