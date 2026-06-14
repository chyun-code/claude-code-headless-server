import { Hono } from "hono";
import { getMessages } from "../store";

export const messageRoutes = new Hono()
  .get("/api/session/:sessionID/message", (c) => {
    const sessionID = c.req.param("sessionID");
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : undefined;
    const order = (c.req.query("order") as "asc" | "desc" | undefined) ?? "asc";

    const msgs = getMessages(sessionID, { limit, order });
    if (!msgs) {
      return c.json({ data: [], cursor: {} });
    }

    return c.json({
      data: msgs,
      cursor: {},
    });
  });
