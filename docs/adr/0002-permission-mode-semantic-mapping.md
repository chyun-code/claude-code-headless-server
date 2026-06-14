# ADR 0002: Semantic Integration of OpenTUI Modes with Claude Code Permission System

**Status:** Accepted
**Date:** 2026-06-14
**Deciders:** Lee Juhyun
**Supersedes:** ADR 0001 (revised: Claude Code spawn strategy)

## Context

ADR 0001 established the baseline architecture: Claude Code in headless mode (`-p` flag), NDJSON stream parsing, SSE event relay. Phase 0 validation confirmed stream-json works in headless mode.

However, the initial implementation used `--permission-mode bypassPermissions` to avoid permission prompts. This was a **mistake** — it destroys Claude Code's entire permission functionality:

- Permission modes (default, acceptEdits, bypassPermissions, plan) are a core Claude Code feature
- OpenTUI has mode switching controls that should semantically map to Claude Code modes
- Users expect the full Claude Code experience through OpenTUI, including permission dialogs
- Claude Code slash commands (`/permission-mode`, `/model`, `/compact`, `/resume`, etc.) must be supported

The goal is not emulation — it's **semantic integration**: every Claude Code behavior has a meaningful OpenTUI counterpart with no loss of functionality.

## Decision

### 1. Claude Code Interactive Mode (Not `-p`)

Claude Code must run in **persistent interactive mode** with an open stdin, not as a one-shot `-p` process:

```
Before (wrong): claude --output-format stream-json -p "prompt"
After (correct): claude --output-format stream-json
                  → write prompt to stdin
                  → keep stdin open for permission responses, slash commands
```

**Rationale:**
- One-shot `-p` mode cannot respond to permission prompts (stdin is closed)
- Interactive mode allows the server to write permission responses to Claude's stdin
- Slash commands can be sent via stdin
- Stream-json output format works identically in interactive mode

### 2. Permission Mode Semantic Mapping

OpenTUI mode controls map directly to Claude Code permission modes:

| OpenTUI Mode | Claude Code Mode | Behavior |
|---|---|---|
| `default` (manual) | `default` | Prompt user for each tool use via SSE→OpenTUI dialog |
| `auto-edit` | `acceptEdits` | Auto-approve file edits, prompt for shell/network |
| `yolo` / `auto-all` | `bypassPermissions` | Execute all tools without prompts |
| `plan` | `plan` | No tool execution, plan only |

Mode changes from OpenTUI trigger a Claude Code restart with the new permission flag, or send `/permission-mode <mode>` via stdin.

### 3. Permission Prompt Relay Architecture

```
┌─────────┐  prompt    ┌──────────┐  stdin     ┌────────────┐
│ OpenTUI │ ────────→  │  Server  │ ────────→  │ Claude Code│
│         │ ←────────  │          │ ←────────  │            │
│         │  SSE event │          │  stream-json│           │
│         │            │          │            │            │
│         │            │  ┌──────┐│            │ "Allow     │
│         │  "Claude   │  │Mapper││            │  tool X?"  │
│         │   asks:    │  │      ││            │            │
│         │   Allow    │  └──────┘│            │            │
│         │   tool X?" │          │            │            │
│         │            │          │            │            │
│ user    │            │          │            │            │
│ clicks  │ ────────→  │ ────────→│            │            │
│ Approve │  HTTP POST │  stdin   │  "yes"     │            │
└─────────┘            └──────────┘            └────────────┘
```

**Event flow:**
1. Claude Code emits a permission request (detected via stream-json system event or tool_use requiring permission)
2. Server maps it to `session.next.permission.requested` SSE event
3. OpenTUI renders a permission dialog
4. User approves/denies
5. OpenTUI sends `POST /api/session/:id/respond` with `{response: "approve"|"deny"}`
6. Server writes response to Claude Code stdin
7. Claude Code proceeds or cancels the tool

### 4. Slash Command Support

OpenTUI slash commands are intercepted and translated to Claude Code equivalents:

| OpenTUI Command | Claude Code Equivalent | Implementation |
|---|---|---|
| `/model <name>` | `/model <name>` | Write to Claude stdin |
| `/compact` | `/compact` | Write to Claude stdin |
| `/resume <id>` | `/resume <id>` | Write to Claude stdin |
| `/fork-session` | `/fork-session` | Write to Claude stdin |
| `/agents` | `/agents` | Write to Claude stdin |
| `/skills` | `/skills` | Write to Claude stdin |
| `/permission <mode>` | `/permission-mode <mode>` | Map and write |
| `/help` | `/help` | Write to Claude stdin |

Commands that require Claude Code restart (model changes) trigger a spawn of a new Claude process with updated flags.

### 5. Interactive Session Lifecycle

```
Session created → Claude Code spawned (interactive, no -p)
                → stdin kept open
                → Stream-json events loop begins
                
Prompt arrives → Written to Claude stdin + newline
               → Claude processes, emits stream-json events
               → Server maps to SSE events for OpenTUI
               
Permission needed → Claude emits permission event
                  → Server sends permission.requested SSE
                  → Waits for HTTP response from OpenTUI
                  → Writes response to Claude stdin
                  
Session ends → Close Claude stdin (EOF)
             → Claude exits gracefully
             → Server emits session.closed event
```

## Consequences

### Positive
- Full Claude Code functionality preserved (permission modes, slash commands)
- OpenTUI becomes a true semantic frontend for Claude Code
- Users keep all Claude Code power with OpenTUI's UI layer
- Future Claude Code features automatically work (no feature loss)

### Negative
- More complex than one-shot `-p` approach
- Permission prompt relay adds latency (user must respond)
- Claude Code restart on mode changes is disruptive (high cost for session resume)
- Need to handle Claude Code internal state machine correctly

### Mitigations
- Phase 1 MVP: default permission mode only, no mode switching
- Phase 2: Add mode switching + permission relay
- Phase 3: Slash command support
- Use stream-json events to detect permission requests before they block

## Alternatives Considered

### A: bypassPermissions + ignore all permissions (REJECTED)
Simplest implementation but destroys Claude Code functionality. Violates core goal.

### B: Headless -p + permission pre-check (REJECTED)
Pre-scan prompts for tool use and pre-approve. Can't handle dynamic tool discovery. Still loses interactive slash commands.

### C: Proxy Claude Code's stdin/stdout via PTY (CONSIDERED for Phase 2)
Full terminal emulation with PTY. Preserves TUI but loses structured event parsing. Better for terminal pane, not for semantic integration.

## References
- ADR 0001: Initial Hono + headless Claude Code architecture
- Goal: "claude code의 동작 범주에 손실이 생기면 안돼" (No loss of Claude Code functionality)
- OpenTUI source: anomalyco/opentui (mode switching UI confirmed)
- Claude Code docs: permission modes, slash commands
