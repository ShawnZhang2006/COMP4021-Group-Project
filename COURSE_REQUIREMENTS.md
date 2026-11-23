# Course requirement and submission checklist

Source: the separately supplied COMP4021 `Group Project.pdf`. Page numbers below refer to that handout. This file maps the implementation and provides checks for the group; it does not claim that Canvas announcements, the project video or final submission are already completed.

## Implementation mapping

| Requirement | Maximum marks | Handout | Implementation |
| --- | ---: | --- | --- |
| Home description/instructions | 5 | 29 | Visible home introduction and field manual with objectives, controls and outcomes. |
| Registration and validation | 10 | 29 | Account form plus server-side username, password, confirmation and duplicate checks. |
| Sign-in, errors and browser session | 10 | 30 | Sign-in form, visible errors, Express session cookie, reload restoration and sign-out. |
| Pairing interface | 15 | 30 | Queue/cancel controls, two-player crew display, difficulty agreement and readiness. |
| Three animated interactive element types | 30 | 31 | Moving/animated explorers, creatures and energy bolts; stones and altars additionally interact. |
| Real-time player interaction | 20 | 16, 31 | Two browsers over WebSocket, shared combat, stone collection, altar defense, revival and teleport. |
| Mouse/keyboard control | 10 | 32 | WASD, aiming/firing, E, R, skill slots, Shift, Esc and Tab. |
| Maximum normal duration | 10 | 19, 32 | Authoritative 240-second limit; dialogs do not pause it. |
| Simple cheat mode, faster completion | 15 | 20, 25, 32 | Tab dialog; reversible effect switches, restores and instant stage charge. |
| Individual statistics | 10 | 33 | Per-player kills, deliveries, actual energy supplied, revives, damage and score. |
| Overall player ranking | 10 | 33 | Persistent best individual clean victories per difficulty, with useful scoring/tiebreaks. |
| Restart/back home | 10 | 33 | Preserve pair and ready again, or leave room and return home. |
| Graphics and two sound files | 10 | 22, 34 | Canvas 2D, `shoot.wav`, `altar_complete.wav` and HTML audio playback. |
| Running the project | 15 | 24, 34 | `npm install`, `node server.js`, `http://localhost:8000`, no build step. |
| Multi-user support | 30 | 35 | Simultaneous real-time inputs; independent paired rooms. Multiple rooms are an implementation choice, not an extra handout requirement. |
| Game quality | 50 | 35 | Cooperative survival, skills and map destruction; creative quality and playability still require human assessment. |
| Project details announcement | 20 | 25–26, 36 | Group must verify its own Canvas announcement and timestamp. |
| Project video | 20 | 36–37 | Group must record and submit the required MP4. |
| **Total** | **300** | 27–28 | Maximum available marks, not a predicted or awarded score. |

Additional constraints from page 23: one Node.js game server, primary use of lab code patterns, permitted general-purpose web libraries, and no game engines/frameworks. `LAB_NOTES.md` identifies the provided source modules and actual adaptations.

## Manual acceptance checks

- [ ] Start from a newly extracted or cloned folder using only the documented installation and server command.
- [ ] Create two accounts in separate browsers/profiles. Verify invalid input, duplicate account errors and incorrect passwords.
- [ ] Reload after sign-in and confirm that the browser session remains. Confirm sign-out clears access.
- [ ] Join/cancel the queue, pair two accounts, change difficulty and verify readiness resets.
- [ ] Verify a third account cannot join an existing pair, and a second pair has independent game state.
- [ ] Start a normal run with both players and check movement, firing, red enemy warnings and synchronized combat.
- [ ] Hear two distinct sounds during play: firing and altar completion. Verify the sound toggle and field-manual dialog.
- [ ] Kill creatures, collect stones, spend one on an altar and spend another with R. Check the pack cap and resource counters.
- [ ] Verify that both second-stage altars are required, including A2 in level one's return area.
- [ ] Choose distinct skills, test cooldown/mana errors, reveal shared enemies, use a decoy, suppress enemies and teleport a teammate.
- [ ] Down one explorer, interrupt a rescue, then complete a two-second rescue. Verify one health and zero initial armor.
- [ ] Enter level three, see the destroyer wake in level one, and check terrain warnings, removal and player relocation.
- [ ] Finish a clean escape with both living explorers in the final exit. Inspect both statistics and individual rankings.
- [ ] Lose once by timeout or both players down; inspect the failure reason and statistics.
- [ ] Open and close the Tab menu without cheating. Then separately enable and disable both switches and test both one-time actions.
- [ ] Complete a cheated run and confirm it does not enter the formal leaderboard, even after switching cheats off.
- [ ] Restart the pair and confirm all entities, resources, map damage, skills, clocks, stats and cheats reset.
- [ ] Leave or disconnect in a live run and confirm the other explorer receives an unranked interruption result.
- [ ] Check desktop layout, keyboard focus and English text in every view. Human balance testing remains required for all difficulties.

## Announcement

The handout's project-details announcement deadline was **13 November 2026 at 23:59**. Verify the original Canvas group announcement; changing this repository does not publish or amend that announcement.

Required announcement content:

1. Game title: ASHFALL, a two-player cooperative survival escape.
2. Home page contents: description, instructions, accounts, login/session, difficulty and pairing.
3. Play page: game description, controls, progression, cooperation and win/loss rules.
4. Game-over page: individual statistics, overall rankings and restart/home controls.
5. Cheating: how to enable and disable effects and how to use one-time actions.

## Final submission

The handout's final files/video deadline is **Monday, 30 November 2026 at 23:59**. One member submits for the group through Canvas. Confirm any course updates directly with the course; this checklist reflects the supplied PDF.

- [ ] Replace the group-number placeholder and submit `<group-number>_project_files.zip`.
- [ ] Include all HTML/CSS/JS, `package.json`, `package-lock.json`, local SVG/WAV assets, empty initial data files and `README.html`. Do not depend on sibling lab folders or local caches.
- [ ] Include all dependencies in `package.json` so one `npm install` prepares the application.
- [ ] Record a **single MP4 of five minutes or less**, mostly focused on gameplay, covering every major feature.
- [ ] Name the video `<group-number>_project_video.mp4`.
- [ ] Verify receipt of both uploads in Canvas. A GitHub push is not the Canvas submission.

A possible 4-minute-50-second video allocation is 40 seconds for home/account/pairing, three minutes for gameplay, 30 seconds for cheat switches and accelerated completion, and 40 seconds for statistics/ranking/restart. Use real demonstrations rather than presenting code for most of the video.
