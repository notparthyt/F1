# Cursor Racing multiplayer server

The Colyseus server hosts private lobbies for up to 22 drivers and runs an
authoritative race simulation using the shared JavaScript vehicle physics.
Clients send bounded driving controls, never positions or lap counts. The
server publishes vehicle snapshots, standings, finish status, and penalties.

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

The local game connects to `ws://localhost:2567` by default. To use another
server, set `window.CURSOR_RACING_MULTIPLAYER_URL` before the game's module
script runs, or append `?multiplayerServer=wss%3A%2F%2Fyour-host` to the URL.
Configure `CLIENT_ORIGINS` with the exact origins allowed to use the server's
HTTP matchmaking endpoints. Lobby codes and bans are held in memory and
disappear when a room closes or the server restarts.

## Checks

```powershell
npm --prefix server test
npm --prefix server run build
```
