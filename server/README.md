# Cursor Racing multiplayer server

The Colyseus server hosts private lobbies for up to 22 drivers and runs an
authoritative race simulation using the shared JavaScript vehicle physics.
Clients send bounded driving controls, never positions or lap counts. The
server publishes vehicle snapshots, standings, finish status, and penalties.
Unexpected client connection drops retain the player and race state for up to
20 seconds while Colyseus attempts to reconnect; intentional leaves still
remove the player immediately.
The WebSocket transport accepts messages up to 1 MiB so custom livery data
within the lobby's 512 KB limit does not trigger a WebSocket 1009 disconnect.

## Race rules

- Both modes use the same fixed-step vehicle physics and server-side car
  collision resolution.
- Casual races do not issue contact or track-limit penalties.
- Competitive races can issue a 3-second penalty after repeated track-limit
  warnings and for high-speed contact. The lobby's penalties toggle disables
  both penalty types; its retirement toggle controls retirement after a
  severe collision.
- Qualifying, when enabled, lasts 60 seconds; best completed laps determine
  the starting order. The race then uses the lobby's lap count and a
  three-second countdown.
- This is an early multiplayer implementation: identities are browser-
  generated, there is no account authentication or persistent results, and
  server-side incident review is not provided. Pit-stop strategy, pit-speed
  enforcement, fuel, weather, damage, jump-start checks, and steward review
  are not yet authoritative online systems.

## Local development

From the repository root, use Node.js 22 or newer:

```powershell
npm --prefix server install
npm --prefix server run start
```

In another terminal, serve the game over HTTP and open it in a browser:

```powershell
py -m http.server 5188 --bind 127.0.0.1
```

The local game connects to `ws://localhost:2567` by default. In the game,
open **Settings → Multiplayer** to add, edit, delete, or select server
connections. These are saved in that browser and the selected server is used
for lobby creation, joining, and invite links. An invite containing a server
URL imports and selects that server. HTTPS sites require a `wss://` URL.
Lobby creation and joining report a connection error if the server does not
respond within 12 seconds.
Before joining, the client checks `/api/lobbies/info` for the lobby's circuit
so it can load the correct track before reserving a seat.
Configure `CLIENT_ORIGINS` with the exact origins allowed to use the server's
HTTP matchmaking endpoints. Lobby codes and bans are held in memory and
disappear when a room closes or the server restarts.

## Deploy on a Node host

Use a Node.js 22-or-newer runtime and upload or clone the full repository:
the server imports shared simulation modules from the root `src/` directory.
Build and run it from the repository root:

```sh
npm --prefix server ci --include=dev
npm --prefix server run build
npm --prefix server run start:prod
```

Set `NODE_ENV=production`, `PORT` to the port allocated by the host, and
`CLIENT_ORIGINS` to the comma-separated HTTPS origins serving the game, for
example `https://notparthyt.github.io,https://f1.gokart.games`.

For HidenCloud, configure a TLS-enabled reverse proxy to the Node server's
allocated port; a DNS/SRV-only subdomain does not provide browser WSS. The
proxy must forward both HTTPS requests and WebSocket upgrades. Add the proxy's
`wss://` address in **Settings → Multiplayer**. The matchmaking API must also
be reachable at `https://<server-host>/api/lobbies/info`.

Free-host idle and restart policies vary. This server keeps rooms and lobby
codes in memory, so a process sleep or restart disconnects players and removes
active lobbies. Verify the provider's limits before relying on it for races.
When the provider supports GitHub integration, configure builds with the
commands above and use the repository root as the build context.

## Checks

```powershell
npm --prefix server test
npm --prefix server run build
```
