// PTY WebSocket Proxy v3 — Fixed stdout relay
// Phase 1: Simple pipe-based PTY with bash

interface PtySession {
  ws: any;
  process: any;
}

const ptySessions = new Map<string, PtySession>();

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

  // Use bash with explicit PS1, interactive mode
  const env = { ...process.env };
  delete env.PS1; // Let bash set its own

  const proc = Bun.spawn(["bash"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...env, TERM: "xterm-256color" },
  });

  ptySessions.set(ptyID, { ws, process: proc });

  // Relay stdout → WS using simple read loop
  (async () => {
    try {
      const stdout = proc.stdout as ReadableStream<Uint8Array>;
      const reader = stdout.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.error(`[pty] stdout EOF for ${ptyID}`);
          break;
        }
        if (value && value.length > 0 && ws.readyState === 1) {
          ws.send(value);
        }
      }
    } catch (e) {
      console.error(`[pty] stdout error:`, e);
    }
  })();

  // Relay stderr → WS
  (async () => {
    try {
      const stderr = proc.stderr as ReadableStream<Uint8Array>;
      const reader = stderr.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length > 0 && ws.readyState === 1) {
          ws.send(value);
        }
      }
    } catch (e) {
      // ignore
    }
  })();
}

export function handlePtyMessage(ws: any, message: string | Buffer) {
  const ptyID = ws.data?.ptyID;
  const session = ptySessions.get(ptyID);
  if (!session) return;

  const data = typeof message === "string"
    ? new TextEncoder().encode(message)
    : new Uint8Array(message as Buffer);

  const writer = session.process.stdin.getWriter();
  writer.write(data);
  writer.releaseLock();
}

export function handlePtyClose(ws: any) {
  const ptyID = ws.data?.ptyID;
  if (!ptyID) return;

  const session = ptySessions.get(ptyID);
  if (session) {
    console.error(`[pty] closing ${ptyID}`);
    session.process.kill();
    ptySessions.delete(ptyID);
  }
}
