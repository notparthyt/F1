# C1 · CursorRacing · notparthyt · CR

## F1 Dynamics Lab — Prototype III

**Play:** [f1.gokart.games](https://f1.gokart.games) · **Source:** [notparthyt/F1](https://github.com/notparthyt/F1)

![CursorRacing F1 Dynamics Lab gameplay screenshot](Screenshot%202026-10-29%20215341.png)

A browser-based, 3D open-wheel racing prototype with a 240 Hz vehicle physics
simulation. Race a 21-car AI field on the stadium test track or choose from 18
real circuits, or run a solo time trial. The circuit layouts are rebuilt from
real racing-line data.

> **Prototype notice:** This project is an experimental vehicle dynamics
> testbed, not an official or validated Formula 1 simulator. Vehicle
> specifications and physics values are illustrative, not measured F1 data.

## Highlights

- **Driving and handling:** keyboard or standard gamepad input, automatic or
  manual paddle-shift gears, reverse, and Sim or Arcade handling.
- **Race weekend systems:** standing starts, AI opponents, lap timing,
  standings, pit stops, tyre compounds, fuel, ERS, DRS, changing weather, and
  safety-car periods.
- **3D cameras:** cockpit, chase, T-Cam, overview, and 360 Look. A separate
  trackside TV camera can record the race to WebM.
- **Car details:** animated driver and steering wheel, cockpit mirrors, and
  player livery selection.
- **Telemetry:** live speed, lap times, vehicle dynamics, and tyre information.

## Run locally

Serve the project over HTTP; ES modules will not work when opening `index.html`
directly as a file.

```powershell
py -m http.server 5188 --bind 127.0.0.1
```

Then open [http://127.0.0.1:5188](http://127.0.0.1:5188). If `py` is not
available, use `python -m http.server 5188 --bind 127.0.0.1`.

The app uses vendored Three.js and has no runtime package install or bundler.
Run the test suite with Node.js:

```powershell
node --test
```

The site is configured as a Cloudflare Worker serving static assets.
`npx wrangler deploy` deploys it to the configured domain. The files excluded
from deployment are listed in `.assetsignore`.

## Getting started

1. Choose a circuit from the header. The stadium starts a race; a real circuit
   starts as a solo time trial. Press **O** to toggle opponents. A real-circuit
   race uses three laps by default; the stadium race uses ten.
2. Drive with **W / ↑** to accelerate, **S / ↓** to brake, and **A / D** or
   **← / →** to steer. Use **P** to toggle the autopilot.
3. Use the HUD and standings to follow lap timing, position, tyres, fuel, and
   penalties. Press **R** to reset the car and restart the session.

In races, use different tyre compounds to meet the two-compound rule. Press
**B** to cycle a pit request, then take the pit lane and stop in your box.
Speeding in the pit lane incurs a penalty.

## Keyboard controls

| Key | Action |
|---|---|
| W / ↑ | Throttle |
| S / ↓ | Brake; at a standstill, selects reverse |
| A / D · ← / → | Steer |
| X / Z | Shift up / down; switches to manual gears |
| G | Return to automatic gears |
| Q / E | Select reverse / forward explicitly |
| F (hold) | Request DRS where permitted |
| B | Cycle pit request: Soft → Medium → Hard → cancel |
| 1–5 | On the start lights, take the selected grid position |
| P | Toggle autopilot |
| Space | Pause / resume |
| R | Reset the car and restart the session |
| C / N | Cycle Cockpit → Chase Cam → T-Cam |
| V | Toggle Overview |
| U | Toggle 360 Look; drag to orbit and scroll to zoom |
| T | Start / stop trackside TV recording |
| O | Toggle opponents and restart the session |
| H | Toggle HUD |
| M | Toggle sound |

Pedals and keyboard steering ramp up and down rather than switching instantly.
Driving keys remain active while a header button has focus.

## Gamepad controls

Any connected gamepad using the browser's standard mapping is supported.
Touch a gamepad button to connect and take control from the autopilot.

| Control | Action |
|---|---|
| RT / R2 | Analog throttle |
| LT / L2 | Analog brake |
| Right stick | Alternative analog throttle / brake |
| Left stick | Analog steering |
| D-pad | Throttle, brake, and steering |
| RB / LB · R1 / L1 | Shift up / down; on the start lights, change grid slot |
| Left-stick click | Return to automatic gears |
| Right-stick click | Take over from autopilot; hold while driving to request DRS |
| A / Cross | Toggle km/h and mph |
| B / Circle | Cycle driving cameras |
| X / Square | Pause / resume |
| Y / Triangle | Toggle fullscreen |
| Menu / Options | Toggle HUD |
| View / Share | Reset the car and session |

Keyboard and gamepad inputs can be combined. Analog triggers and sticks use a
small deadzone; steering authority decreases with speed.

## Modes and options

- **Handling:** the header button switches between Sim and Arcade. Arcade adds
  grip and countersteering assistance while preserving full player throttle;
  AI cars use the same Arcade grip and cornering/braking targets.
- **Original car:** toggles the player's car between its authored model livery
  and the CursorRacing livery. AI liveries are unaffected.
- **DRS:** in a race, DRS is limited to enabled zones and eligibility rules.
  In a solo time trial or with opponents disabled, it can be requested anywhere.
- **Weather:** rain changes track grip and the AI's corner-speed targets.
- **Pit stops:** with opponents enabled, races use a two-compound rule. Request
  a compound with **B** and stop in your pit box.

Supported URL options:

| Query option | Effect |
|---|---|
| `?track=<key>` | Select a real circuit for a solo time trial |
| `&race` | Start with AI opponents on a real circuit |
| `?laps=N` | Set race distance (default: 10 stadium, 3 real circuit) |
| `?tyre=soft`, `?tyre=medium`, or `?tyre=hard` | Set the starting compound |
| `?nostart` | Skip the starting lights |
| `?handling=arcade` | Start in Arcade handling |
| `?car=procedural` | Use the built-in procedural car instead of the RB22 |

Examples: [Monza race](https://f1.gokart.games/?track=monza&race) ·
[Spa time trial](https://f1.gokart.games/?track=spa) ·
[five-lap Spa race on soft tyres](https://f1.gokart.games/?track=spa&race&laps=5&tyre=soft)

## Camera and model tuning

The browser console exposes `f1Lab.setTcam(...)` and `f1Lab.tcam()` to adjust
and inspect T-Cam framing. Mount and look-at offsets are metres in car
coordinates (+X forward, +Y up, +Z sideways); FOV accepts 20–100 degrees:

```js
f1Lab.setTcam({ mount: [-0.2, 0.1, -0.1], lookAt: [9, -2.5, 0], fov: 60 });
```

The cockpit camera follows the animated driver's head. The rear flap can be
configured at runtime with `f1Lab.setRearFlap(...)`; use `f1Lab.rearFlap()` to
inspect its current settings.

## Documentation

- [Physics and 3D model](docs/PHYSICS.md) — vehicle model, cameras, track, and
  simulation details.
- [Development log](docs/DEVLOG.md) — implementation history, tests, and
  development notes.
- [Model and texture credits](models/CREDITS.md) — third-party assets,
  licenses, and project attributions.

## Credits

Project credits: **C1**, **CursorRacing**, **notparthyt**, and **CR**.
Three.js is MIT licensed; see [`vendor/LICENSE-three`](vendor/LICENSE-three).
Third-party models and textures retain their own licenses and attributions;
see [models/CREDITS.md](models/CREDITS.md).
