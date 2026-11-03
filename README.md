# C1 · CursorRacing · notparthyt · CR

## F1 Simulator — Production

**Play:** [GitHub Pages](https://notparthyt.github.io/F1/) · **Source:** [notparthyt/F1](https://github.com/notparthyt/F1)

![CursorRacing F1 Dynamics Lab gameplay screenshot](Screenshot%202026-10-29%20215341.png)

A browser-based, 3D open-wheel racing prototype with a 240 Hz vehicle physics
simulation. Race a 21-car AI field on the stadium test track or choose from 18
real circuits, or run a solo time trial. The circuit layouts are rebuilt from
real racing-line data.

> **Prototype notice:** This project is an experimental vehicle dynamics
> testbed, not an official or validated Formula 1 simulator. Vehicle
> specifications and physics values are illustrative, not measured F1 data.

> **Proprietary software:** This project is not open source or free to reuse.
> Copyright is reserved. Viewing the code does not grant permission to use,
> modify, or redistribute it outside rights provided by GitHub's Terms of
> Service. Contact the maintainer for a separate license. Third-party assets
> retain their own terms; see [models/CREDITS.md](models/CREDITS.md) and
> [LICENSE](LICENSE).

## Highlights

- **Driving and handling:** keyboard or standard gamepad input, automatic or
  manual paddle-shift gears, reverse, and Sim or Arcade handling.
- **Race weekend systems:** standing starts, AI opponents, lap timing,
  standings, pit stops, tyre compounds, fuel, ERS, DRS, changing weather, and
  safety-car periods. Q1, Q2, and Q3 set the race grid; each player session
  starts on fresh Soft tyres, and tyre wear begins with the main race.
- **3D cameras:** cockpit, chase, T-Cam, overview, and 360 Look. A separate
  trackside TV camera can record the race to WebM.
- **Car details:** animated driver and steering wheel, cockpit mirrors, and
  player livery selection.
- **Telemetry:** live speed, lap times, vehicle dynamics, and tyre information.
- **Graphics:** Default, Mid Optimized, and Max Optimized performance presets.
- **Race control:** penalty and safety-car notices, a text-only team engineer,
  position-redress checks, and pit-lane speed assistance.

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

GitHub Pages publishes the project from the `main` branch root. The site is
available at [notparthyt.github.io/F1](https://notparthyt.github.io/F1/).
The existing Cloudflare Worker can also be deployed with `npx wrangler deploy`;
the files excluded from that deployment are listed in `.assetsignore`.

## Getting started

1. Choose **Singleplayer**, select a circuit, and set at least three laps.
   With opponents on, configure qualifying, DNF retirements, and penalties
   independently. Turning opponents off disables and locks those options;
   races without qualifying use a randomized grid. Multiplayer is marked as
   coming soon. Use the gear icon for controls, graphics,
   gameplay, keybind, and driver-profile settings.
2. With qualifying enabled, Q1–Q3 set the grid; otherwise, the AI grid is
   randomized. Your driver spawns beside the car; click the viewport to aim at
   it and press **L** to enter.
3. Drive with **W / ↑** to accelerate, **S / ↓** to brake and select reverse
   at a stop, and **A / D** or **← / →** to steer. Press **Esc** to pause;
   choose **Exit to main menu** in the pause menu to return.
4. Use the HUD and standings to follow lap timing, position, tyres, fuel, and
   penalties. Press **R** to reset the session.

Race starts use a track-specific starting compound and require a pit stop onto a second compound.
Press **B** to cycle a requested tyre. With **Auto-pit** enabled, the assistant
takes control near the pit entry and returns it after the pit exit; press **I**
to take manual control early. Otherwise, drive into the pit lane and stop in
your box. Speeding in the pit lane incurs a penalty. Map starts show a loading screen with progress from the actual asset
loader. The browser caches downloaded car and driver model assets for later
visits. The text Race Assistant also reads its guidance aloud when speech
synthesis is available. Rendering is capped at 60 frames per second, independently
of the 240 Hz simulation; distant cars use simplified models and far tree detail
is culled to reduce rendering work.

During a race, **F** opens DRS anywhere on track without a detection-gap rule;
braking closes it. Hold **O** for the lower-power ERS Normal boost. Press **O**
while within one second of a car ahead to latch the stronger Overtake mode;
press **O** again or brake to return to Normal.

Outside the car, **W** walks forward, **S** walks backward, and **A / D**
strafe relative to the camera; double-tap **W** to run and press **Space** to
jump. Barriers and cars block the driver. **Shift** stands the driver. Press
**E** while standing still to open the emote menu, then press **1–9** or click
an emote; **E** or **Esc** closes the menu. **M** opens the driver suit menu.
Moving cancels an emote and resumes the walking animation. In a race, you can
exit with **L** only after finishing; in practice or a solo time trial,
complete a lap first.

## Keyboard controls

| Key | Action |
|---|---|
| W / ↑ | Throttle |
| S / ↓ | Brake; at a standstill, selects reverse |
| Space (driving) | Brake only; configurable in Settings |
| A / D · ← / → | Steer |
| X / Z | Shift up / down; switches to manual gears |
| G | Return to automatic gears |
| Q / E | Select reverse / forward explicitly while driving; E opens the emote menu on foot |
| F (hold) | Request DRS where permitted |
| B | Cycle pit request: Soft → Medium → Hard → cancel |
| W / A / S / D (on foot) | Walk |
| Mouse (on foot) | Aim with the centered reticle |
| E, then 1–9 (on foot) | Open the emote menu and play an emote |
| Esc (on foot) | Close the emote menu |
| C / N (on foot) | Cycle third-person, first-person, and second-person cameras |
| L (on foot) | Enter when aiming at the car; exit only after finishing |
| 1–5 | On the start lights, take the selected grid position |
| Esc | Pause / resume |
| I (during auto-pit) | Return to manual control |
| Space (on foot) | Jump |
| Double-tap W (on foot) | Run |
| Shift (on foot) | Stand |
| M (on foot) | Open driver suit menu |
| R | Reset the session |
| C / N | Cycle Cockpit → Chase Cam → T-Cam |
| V | Toggle Overview |
| U | Toggle 360 Look; drag to orbit and scroll to zoom |
| T | Start / stop trackside TV recording |
| O | Toggle ERS deployment; status and charge appear in the timing HUD |
| H | Toggle HUD |
| M | Toggle sound |

DRS, brake-only, ERS, emote, dress, and camera keys can be reassigned in Settings.
WASD throttle and steering keys remain fixed. Pedals and keyboard steering
ramp up and down rather than switching instantly.

## Gamepad controls

Any connected gamepad using the browser's standard mapping is supported.
Touch a gamepad button to connect and drive when the car is not under auto-pit
assistance.

| Control | Action |
|---|---|
| RT / R2 | Analog throttle |
| LT / L2 | Analog brake |
| Right stick | Alternative analog throttle / brake |
| Left stick | Analog steering |
| D-pad | Throttle, brake, and steering |
| RB / LB · R1 / L1 | Shift up / down; on the start lights, change grid slot |
| Left-stick click | Return to automatic gears |
| Right-stick click | Hold while driving to request DRS |
| A / Cross | Toggle km/h and mph |
| B / Circle | Cycle driving cameras |
| Y / Triangle | Pause / resume |
| X / Square | Toggle fullscreen |
| Menu / Options | Toggle HUD |
| View / Share | Reset the car and session |

Keyboard and gamepad inputs can be combined. Analog triggers and sticks use a
small deadzone; steering authority decreases with speed.

## Modes and options

- **Handling:** choose Sim or Arcade in Settings. Arcade adds
  grip and countersteering assistance while preserving full player throttle;
  AI cars use the same Arcade grip and cornering/braking targets.
- **Graphics:** choose Ultra Max, Max, High, Default, Low (Mid Optimized), or
  Max Optimized. Settings control resolution, shadows, and mirrors.
- **Original car:** toggles the player's car between its authored model livery
  and the CursorRacing livery. A cropped custom image or your driver name can
  be applied to the player car; AI liveries are unaffected.
- **DRS:** in a race, DRS is limited to enabled zones and eligibility rules.
  In a solo time trial or with opponents disabled, it can be requested anywhere.
- **Weather:** rain changes track grip and the AI's corner-speed targets.
- **Pit stops and race control:** races use a mandatory two-compound stop.
  Auto-pit assistance is optional. Safety cars deploy after retirements or
  major car-to-car crashes; nearby traffic is speed-capped. During a safety-car
  overtake, the player can choose to give the position back or accept a
  five-second penalty; a selected yield that is not completed within three
  seconds also incurs the penalty. Passes involving cars entering or in the pit
  lane are exempt. Minor contact is not penalized; contact penalties require a
  major crash. Off-track gained positions are also penalized. Penalties affect
  final classification rather than instantly changing running order; outstanding
  time can be served during a pit stop, and only unserved time counts at the
  finish. Penalties can be disabled when opponents are off.
- **Team engineer and notices:** suggestions and race-control messages appear
  as text at the left of the screen. Penalties, retirements, and flags briefly
  display in a yellow banner at the top; these are in-game notices, not desktop
  notifications. The team engineer can use speech synthesis for guidance.
- **Pause menu:** adjust sound volume and graphics or exit to the main menu.

Supported URL options:

| Query option | Effect |
|---|---|
| `?track=<key>` | Select a real circuit |
| `&race` | Start with AI opponents on a real circuit |
| `&solo=1` | Disable opponents (including on the stadium track) |
| `?laps=N` | Set race distance (minimum: 3 laps) |
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

## License and reuse

The original project code is proprietary and all rights are reserved; it is
not licensed for general use, modification, or redistribution. A public GitHub
repository cannot disable cloning, downloading, or forking, and code delivered
to a browser can be inspected. GitHub allows users to view and fork public
repositories under its platform terms. The notice and [LICENSE](LICENSE)
describe the project's rights; they cannot technically prevent copies. For
code that is not publicly accessible, the source repository must be private,
which requires a GitHub plan that supports public Pages from a private repo or
a separate public-site deployment.
