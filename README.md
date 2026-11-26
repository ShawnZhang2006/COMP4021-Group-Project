# ASHFALL

**A two-player, real-time survival escape game for COMP4021 Internet Computing.**

Two explorers enter a connected, three-level ruin. Hunt hidden creatures, carry their energy stones to four altars, and reach the final exit together before the world collapses. A normal run has a hard limit of **240 seconds**.

The application, source comments, documentation and interface are written in English. It uses HTML5 Canvas, Express, sessions and Socket.IO over WebSocket. There is one Node.js server, no game engine, no build step, no CDN dependency and no external database.

## Run the game

Use Node.js 22 or later. Node.js 26.13.0 was used for the automated checks.

From the folder containing `package.json`:

```sh
npm install
node server.js
```

Open **http://localhost:8000** in **two different browsers or two separate browser profiles**. Create a different account in each, choose **Find a teammate**, agree on a difficulty and have both players click **Ready for expedition**. A normal tab and an incognito window also have separate login cookies. Two regular tabs in the same browser profile share a session and cannot represent two different players.

`npm install` installs all dependencies. `node server.js` starts the single server directly; no startup script or build command is needed. Keep port 8000 available. `README.html` contains the same essential setup and marking instructions in a standalone HTML file.

## How to play

1. **Level one: A1.** Kill creatures and walk within 1.5 tiles of their stones to collect them automatically. E can also collect a stone within two tiles. Carry stones to A1 and press E to charge it. A1 unlocks level two and the first skill choice.
2. **Levels one and two: A2 + B2.** Charge the newly unlocked A2 in the first level and B2 in the second. Split up or stay together. Enemies now attack unfinished altars. Both altars must be full to unlock level three and the second skill choice.
3. **Level three: C3.** The first explorer to enter level three awakens the destroyer in level one. It progressively destroys the map. Charge C3 to open the final exit and choose the third skill.
4. **Extract together.** Follow the protected route from C3 to the relocated exit. Both living explorers must stand inside its ring for two uninterrupted seconds before the timer reaches zero.

An altar holds 100 energy. Each stone supplies 25 energy; unfinished altars lose one energy per second and another ten on each enemy hit. Completed altars stay full. A pack holds eight stones. Alternatively, press R to consume a carried stone and restore 40 mana. A stone cannot be used for both purposes.

In a clean run, you lose immediately when both explorers are down, the timer expires, or all destructible terrain is gone. World collapse ends the run even if C3 is fully charged, both explorers are standing at the exit, or stones remain in a pack. Complete the two-second extraction before the final tile is destroyed and before the four-minute limit. Cheated runs use the guaranteed escape assistance described below.

Armor absorbs a hit before health is affected. After five seconds without damage, armor starts recovering one layer every two seconds. Health does not regenerate. Hold E within two tiles of a downed teammate for two uninterrupted seconds to revive them with one health, no armor and two seconds of protection.

## Controls

| Input | Action |
| --- | --- |
| W / A / S / D | Move in eight directions; diagonal speed is normalized. |
| Mouse / left button | Aim and shoot energy bolts. Hold to continue firing. |
| E | Within two tiles: deposit one stone, hold to revive, or pick up one stone manually. |
| R | Consume one carried stone to restore 40 mana. |
| 1 / 2 / 3 | Select a skill slot, then click intact ground to cast. |
| Shift while casting Teleport | Teleport a teammate within two tiles instead of yourself. |
| Minimap with Teleport selected | Click an unlocked altar to target its safe zone across levels. |
| Esc | Cancel skill targeting or close an ordinary dialog. |
| Tab | Open or close cheat controls during gameplay. |

Stones are collected automatically within 1.5 tiles, up to the eight-stone pack limit, independently of rescue progress. E works within two tiles and prioritizes an eligible revival, then an altar deposit, then a manual stone pickup. An empty pack or completed altar does not block pickup. Client hints and server checks use the same shared interaction range.

Skill selection and all menus keep the game clock running. A choice is assigned automatically after eight seconds. Each explorer chooses separately and cannot own the same skill twice.

## Skills and difficulty

| Skill | Mana | Cooldown | Effect |
| --- | ---: | ---: | --- |
| Reveal | 20 | 8 s | Reveal hidden enemies within six tiles for four seconds; both explorers see them. |
| Decoy | 25 | 10 s | Attract nearby enemies to a decoy for five seconds. |
| Teleport | 40 | 12 s | Instantly move yourself or a nearby teammate to legal, unlocked ground. |
| Suppress | 30 | 12 s | Slow enemies by 50% for four seconds; slow the destroyer by 25%. |

| Difficulty | Starting armor | Starting health | Starting mana | Time limit |
| --- | ---: | ---: | ---: | ---: |
| Easy | 10 | 5 | 100 | 240 s |
| Normal | 7 | 4 | 100 | 240 s |
| Hard | 5 | 3 | 100 | 240 s |

## Cheat mode for demonstration and marking

Press **Tab during gameplay**. Controls affect both explorers in that room:

- **Invincibility:** an independent on/off switch. It prevents damage while enabled.
- **Infinite mana:** an independent on/off switch. Skill cooldowns and ordinary firing intervals remain.
- **Restore both explorers:** a one-time full restore, including revival.
- **Instantly charge this stage:** a one-time completion of the current stage's unfinished altars. At stage two it fills both A2 and B2 across levels; at stage three it fills C3 and opens the exit.

Closing the menu does **not** disable active effects. Toggle each switch off to disable it. One-time actions are not rolled back. A new run resets all cheat settings and game state. Merely opening the menu does not count as cheating, but using any cheat permanently marks that run as unranked, even after toggling the effect off.

Using any cheat also enables guaranteed escape assistance for the rest of that run. The last destructible tile is preserved. Before that tile would disappear, or if the timer expires or both explorers go down, assistance fills all altars, restores both explorers, moves them to the exit and holds both explorers at the exit for two seconds before recording the victory. This presentation replaces the usual two-second extraction wait and remains enabled after switches are turned off. Cheated victories never enter the leaderboard. Leaving or disconnecting still aborts the session.

For a quick complete demonstration, enable invincibility, charge the first two stages, choose Teleport for a newly available slot, jump to C3 on the minimap, charge the final stage and have both explorers enter the exit ring. The normal game, skill choices, destroyer and final statistics still run.

## Statistics and ranking

The result screen shows each explorer's kills, delivered stones, actual supplied energy, revives, hits taken and score. It also shows the shared outcome, elapsed time, difficulty and cheat status.

Score is **10 per kill + 20 per delivered stone + 30 per revive**. A successful escape adds **100 + complete seconds remaining** to each explorer's score. The overall leaderboard stores each account's best clean victory separately for each difficulty. It sorts by score, then shorter completion time, then more revives, then username. Failed, aborted and cheated runs still show statistics but do not enter the official leaderboard.

**Play again** preserves the pair and returns both players to ready checks. It clears all previous map damage, enemies, drops, skills, stats, clocks and cheats. **Return home** leaves the pair. A disconnected or departing player aborts the active run for both explorers; the game does not silently continue or record a ranked result.

## Project structure

```text
server.js                    Express routes, session setup and HTTP/WebSocket server
server/game.js               Authoritative game simulation and win/loss rules
server/rooms.js              Queue, pairing, readiness, isolated rooms and lifecycle
server/store.js              Hashed accounts and persistent individual rankings
public/index.html            English home, game, result and dialog interfaces
public/style.css             Responsive game interface
public/shared/               Shared map, collision helpers and skill definitions
public/js/app.js             Account forms, networking, HUD, audio and controls
public/js/renderer.js        Procedural Canvas world, animation and minimap
public/assets/audio/         Two original PCM WAV sound files
data/                        Initial empty account and leaderboard data files
test/                        Rules, storage, HTTP and WebSocket integration tests
tools/generate-audio.py      Optional audio regeneration using Python's standard library
DESIGN.md                    English implementation design and parameters
COURSE_REQUIREMENTS.md       Requirement mapping and submission checklist
LAB_NOTES.md                 Lab code provenance and adaptations
README.html                  Standalone setup and marking instructions
```

All graphics are drawn with Canvas or the included small SVG logo. Both sound effects are generated locally and included; Python is **not** required to run the game. No third-party image or audio downloads are needed.

## Checks

```sh
npm run check
npm test
```

Tests exercise the real game simulation, JSON persistence, password validation, authenticated HTTP requests and actual WebSocket connections. Integration tests start a temporary server on an available local port and use temporary data directories. They cover room isolation, pairing, ready checks, synchronized movement, cheats, restart and disconnect handling. Regression checks cover rescue alongside automatic pickup, two-tile HUD prompts, pack limits, a walkable escape route before complete world destruction, immediate clean-run collapse defeat even with C3 full, and guaranteed unranked cheat escapes with the final tile preserved. They do not overwrite the submitted empty data files.

A deterministic server-side bot playthrough also checks full uncheated victories on all three difficulties using legal movement, combat, resource, progression and skill actions. Those bots know entity positions; their completion times demonstrate mechanical reachability and do not establish human playtime or difficulty balance.

The interface test connects a JSDOM document to a real server, with drawing/audio test doubles, to check form, lobby, controls, skill-dialog, cheat and result bindings. It exercises Canvas calls but does not produce a visual screenshot or verify audible output. Also complete the manual two-browser and audio/visual checklist in `COURSE_REQUIREMENTS.md` before recording the final project video. A successful automated test run does not substitute for visual inspection or human balance testing.

For development only, `ASHFALL_DATA_DIR` may point to a separate writable data folder, and `SESSION_SECRET` may provide a persistent session-signing secret. Neither is needed for the required default startup. Sessions are local to the single server process, while accounts and leaderboards survive server restarts.

## Course sources

This application extends the locally supplied Lab 3, Lab 5 and Lab 6 patterns; see `LAB_NOTES.md` for the exact source modules and changes. The course requirements are from the separately provided `Group Project.pdf`. The original Chinese design document is not committed because this repository is English-only.

Implementation references: [Socket.IO with Express sessions](https://socket.io/how-to/use-with-express-session), [Express session middleware](https://expressjs.com/en/resources/middleware/session/), and [Socket.IO client transport options](https://socket.io/docs/v4/client-options/).
