// PTY WebSocket Proxy — Phase 2: Real terminal emulation
// Uses node-pty when available, falls back to Bun.spawn pipe.
// ADR 0003: No files outside server directory.

interface PtySession {
  ws: any;          // Bun ServerWebSocket
  pty: any;         // node-pty IPty | Bun Subprocess
  ptyID: string;
}

const ptySessions = new Map<string, PtySession>();

// --- PTY Factory ---

function createPty(ws: any, ptyID: string): PtySession | null {
  // Try node-pty first (real PTY with resize support)
  try {
    const pty = require("node-pty");
    const term = pty.spawn("bash", [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: { ...process.env, TERM: "xterm-256color" },
    });

    const session: PtySession = { ws, pty: term, ptyID };

    term.onData((data: string) => {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    });

    term.onExit(({ exitCode }: { exitCode: number }) => {
      console.error(`[pty] bash exited code=${exitCode} for ${ptyID}`);
      if (ws.readyState === 1) {
        ws.close();
      }
      ptySessions.delete(ptyID);
    });

    return session;
  } catch (_) {
    // node-pty not available, fall back to Bun.spawn pipe
  }

  // Fallback: Bun.spawn with piped stdio (no PTY, no resize)
  try {
    const proc = Bun.spawn(["bash", "--norc"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, TERM: "xterm-256color" },
    });

    const session: PtySession = { ws, pty: proc, ptyID };

    // stdout → WS
    (async () => {
      const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length > 0 && ws.readyState === 1) {
            ws.send(value);
          }
        }
      } catch (_) {}
    })();

    // stderr → WS
    (async () => {
      const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length > 0 && ws.readyState === 1) {
            ws.send(value);
          }
        }
      } catch (_) {}
    })();

    return session;
  } catch (e) {
    console.error(`[pty] failed to create PTY:`, e);
    return null;
  }
}

// --- WebSocket Handlers ---

export function handlePtyUpgrade(req: Request, server: any): Response | undefined {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/pty\/(.+)\/connect$/);
  if (!match) return undefined;

  const ptyID = match[1];
  const success = server.upgrade(req, { data: { ptyID } });

  if (!success) {
    return new Response("WebSocket upgrade failed", { status: 400 });
  }

  return undefined;
}

export function handlePtyOpen(ws: any) {
  const ptyID = ws.data?.ptyID;
  if (!ptyID) return;

  console.error(`[pty] WS connected for ${ptyID}`);

  const session = createPty(ws, ptyID);
  if (session) {
    ptySessions.set(ptyID, session);
  }
}

export function handlePtyMessage(ws: any, message: string | Buffer) {
  const ptyID = ws.data?.ptyID;
  const session = ptySessions.get(ptyID);
  if (!session) return;

  // Check for resize message (JSON with cols/rows)
  if (typeof message === "string") {
    try {
      const parsed = JSON.parse(message);
      if (parsed.cols && parsed.rows && typeof session.pty.resize === "function") {
        session.pty.resize(parsed.cols, parsed.rows);
        return;
      }
    } catch (_) {}
  }

  // Write to PTY stdin
  const data = typeof message === "string"
    ? message
    : Buffer.from(message).toString();

  if (typeof session.pty.write === "function") {
    // node-pty
    session.pty.write(data);
  } else if (session.pty.stdin && typeof session.pty.stdin.write === "function") {
    // Bun FileSink
    session.pty.stdin.write(new TextEncoder().encode(data));
  }
}

export function handlePtyClose(ws: any) {
  const ptyID = ws.data?.ptyID;
  if (!ptyID) return;

  const session = ptySessions.get(ptyID);
  if (session) {
    console.error(`[pty] closing ${ptyID}`);
    try {
      if (typeof session.pty.kill === "function") {
        session.pty.kill();
      }
    } catch (_) {}
    ptySessions.delete(ptyID);
  }
}
