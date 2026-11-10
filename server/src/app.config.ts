import {
  createEndpoint,
  createRouter,
  defineRoom,
  defineServer,
  matchMaker,
  monitor,
} from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { z } from "zod";
import { LobbyRoom } from "./rooms/LobbyRoom.js";
import { findLobbyCircuit, findLobbyRoom } from "./rooms/lobbyCodes.js";

const server = defineServer({
  transport: new WebSocketTransport({
    maxPayload: 1024 * 1024,
  }),
  rooms: {
    race_lobby: defineRoom(LobbyRoom),
  },
  routes: createRouter({
    lobby_info: createEndpoint("/api/lobbies/info", {
      method: "POST",
      body: z.object({
        code: z.string().regex(/^\d{6}$/),
      }),
    }, async (ctx) => {
      const circuit = findLobbyCircuit(ctx.body.code);
      if (circuit === undefined) {
        return ctx.error("NOT_FOUND", {
          message: "Lobby code expired or was not found. Ask the host to create a new lobby code.",
        });
      }
      return { circuit };
    }),
    join_lobby: createEndpoint("/api/lobbies/join", {
      method: "POST",
      body: z.object({
        code: z.string().regex(/^\d{6}$/),
        identity: z.string().min(8).max(128),
        name: z.string().trim().min(1).max(24),
      }),
    }, async (ctx) => {
      const roomId = findLobbyRoom(ctx.body.code);
      if (!roomId) {
        return ctx.error("NOT_FOUND", {
          message: "Lobby code expired or was not found. Ask the host to create a new lobby code.",
        });
      }
      try {
        return await matchMaker.joinById(roomId, {
          identity: ctx.body.identity,
          name: ctx.body.name,
        });
      } catch (error) {
        if (error instanceof Error) {
          console.warn("Lobby join was rejected:", error.message);
          if (error.message === "This player is already in the lobby.") {
            return ctx.error("BAD_REQUEST", { message: error.message });
          }
        }
        return ctx.error("BAD_REQUEST", {
          message: "Could not join that lobby. Check the code and try again.",
        });
      }
    }),
  }),
  express: (app) => {
    const allowedOrigins = new Set(
      (process.env.CLIENT_ORIGINS ?? "https://f1.gokart.games,https://notparthyt.github.io,http://localhost:5188,http://127.0.0.1:5188,http://localhost:8765,http://127.0.0.1:8765")
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean),
    );
    app.use((req, res, next) => {
      const origin = req.get("origin");
      if (origin && allowedOrigins.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
      }
      if (req.method === "OPTIONS") {
        res.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403);
        return;
      }
      next();
    });

    if (process.env.NODE_ENV !== "production") {
      app.use("/monitor", monitor());
    }
  },
});

export default server;
