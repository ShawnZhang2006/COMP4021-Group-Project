# ASHFALL implementation design

## Scope and game loop

ASHFALL is a two-player cooperative, top-down 2D escape game. Each browser controls one explorer. Both players share one connected map and can act simultaneously. A run lasts at most 240 seconds from both players being ready. Account access and queue waiting are outside the clock. Skill choices, dialogs, inactive browser tabs and cheat menus do not pause it.

The map is 30 by 45 tiles, arranged as three vertically connected 15-row levels. The camera follows the local explorer and the minimap shows all three levels. Stair openings at the middle of each boundary connect unlocked levels. A fixed map supports reproducible play; creature spawn positions are selected on the server.

| Stage | Required altars | Result |
| --- | --- | --- |
| 1 | A1 in level one | Unlock level two, A2, B2 and the first skill choice. |
| 2 | A2 in level one's return area and B2 in level two | Both must be completed; unlock level three, C3 and the second skill choice. |
| 3 | C3 in level three | Unlock the final exit and third skill choice. |

The destroyer spawns once, in level one, when either explorer first enters level three. Unlocking the third level alone does not spawn it.

## Player resources

Easy/Normal/Hard start with 10/7/5 armor and 5/4/3 health. Mana starts at 100 in every difficulty. A normal hit removes one armor layer, or one health if armor was already zero; a single hit never damages both. One second of hit protection prevents repeated same-frame damage. After five seconds without damage, armor recovers one layer every two seconds, capped at the starting value. Health does not automatically recover.

Health zero means downed: movement, firing and casting stop, but carried stones remain. A living teammate within one tile holds E for two seconds to revive the explorer. Moving, taking damage or leaving range interrupts that rescue. A revival restores one health, zero armor and two seconds of protection; armor recovery starts a fresh delay. If both explorers are down, the run ends.

Normal energy bolts cost five mana, deal one damage and have a 0.25-second firing interval. Mana regenerates at eight per second, capped at 100. Pressing R consumes one carried stone for 40 mana; an empty pack or full mana consumes nothing. A projectile flies over destroyed floor but intact walls and sealed passages block it.

## Stones and altar state

Each creature killed by a player drops one stone at its position. Press E within one tile to collect one stone, up to eight per pack. A collected stone is removed by the server before another player's pickup is processed. The destroyer's kills provide neither stones nor player kill credit.

Press E within one tile of an unlocked unfinished altar to spend one carried stone for up to 25 energy. The cap is 100, with excess energy discarded. Unfinished unlocked altars lose one energy per second. Creature attacks additionally remove ten energy. At 100, an altar completes permanently and becomes immune to all energy loss. Sealed altars cannot be charged or drained.

The E interaction order is: eligible downed teammate, eligible deposit, eligible ground pickup. Eligibility is checked before choosing the operation. An empty pack cannot block a nearby pickup simply because an altar is also nearby. One key press only performs one operation. Revival uses the held key; deposits and pickups use the initial key press.

## Creatures and destruction

Creatures normally remain hidden. Their attacks have a 0.8-second red ground warning and reveal them for one second afterward. Taking a projectile hit briefly reveals them too; Reveal exposes them to both explorers. Each has two health, moves at 2.5 tiles per second and attacks every two seconds. The server attempts one spawn every three seconds with a cap of ten active creatures. Spawn points must be intact, unlocked, outside altar safe zones and at least two tiles away from a player. Most spawn attempts favor an occupied level to keep stones available during progression. An attempt with no legal point is skipped.

In stage one, creatures pursue living players. From stage two, an unfinished, unlocked altar within six tiles takes priority. A nearby decoy overrides either target. Grid pathfinding routes creatures around intact obstacles and through unlocked stairs. Suppress slows movement and attacks. The attack marker stays at the telegraphed target location so moving away can avoid the hit.

The destroyer cannot be killed by normal fire. It follows a fixed tile order from level one through level three. There are N destructible tiles; its normal destruction interval is 70/N seconds per tile, giving approximately 70 seconds to destroy the ordinary map after it wakes. Affected upcoming tiles display a one-second warning. Suppress reduces its movement/destruction speed by 25%.

Altar safe zones have a two-tile radius and survive destruction. The final exit lies inside C3's safe zone. Creatures cannot spawn in a safe zone but may walk into it. If a tile disappears beneath a player, the player takes one normal hit and is moved to the closest legal tile on the same level; when ordinary terrain is gone, the level's surviving altar area provides fallback ground. Destroyed ordinary tiles cannot be walked on or targeted by Teleport. Ground stones disappear with their floor, while packed stones remain.

When all destructible terrain disappears and C3 is unfinished, world collapse immediately ends the run, regardless of any remaining stones or creatures. This is an explicit failure rule. If C3 is already full, this collapse condition no longer applies; the exit and four-minute deadline remain.

## Skills and input

Each stage completion grants one skill choice to each explorer. Owned skills cannot repeat, but partners may choose the same skills. An eight-second deadline selects the first remaining skill automatically. At most three skills are owned. If multiple stages finish quickly, unused choices remain available one at a time.

| Skill | Mana | Cooldown | Duration | Range/effect |
| --- | ---: | ---: | ---: | --- |
| Reveal | 20 | 8 s | 4 s | Six-tile reveal radius, visible to both players. |
| Decoy | 25 | 10 s | 5 s | Six-tile attraction radius, higher priority than other targets. |
| Teleport | 40 | 12 s | Instant | Self by default; Shift targets a teammate within two tiles. |
| Suppress | 30 | 12 s | 4 s | Four-tile radius; 50% creature slowdown, 25% destroyer slowdown. |

Skills are selected with 1/2/3 and cast by clicking legal ground. Teleport can use an unlocked altar selected on the minimap, including a different level. A downed teammate may be teleported but remains downed. Invalid targets, missing mana and unfinished cooldowns do not spend resources. Esc cancels targeting. While targeting, the left button does not also fire a normal bolt.

WASD movement is normalized for diagonals. Player speed is four tiles per second. The browser sends input intentions at 20 Hz; the server clamps them, checks collisions, and expires stale movement/fire commands after 0.4 seconds. The renderer interpolates authoritative positions. Focusing a dialog or losing window focus clears movement and firing inputs.

## Victory, cheats and ranking

Both living explorers must remain within the final exit radius for two uninterrupted seconds after C3 is complete, and finish before 240 seconds. Leaving the radius or becoming downed resets extraction progress. Results are finalized once on the server. A departure or disconnect aborts the active run for both players and prevents ranking.

Tab toggles a cheat-control dialog. Invincibility and infinite mana are independent switches shared by both explorers in a room. Restore is a one-time full restore and revival. Instant charge completes the current stage, including both second-stage altars, through normal progression events. Menu closure preserves effects; switching them off restores ordinary rules. A new run resets all effects and irreversible state. Invincibility does not stop the clock or cancel collapse; infinite mana preserves firing intervals and skill cooldowns.

Any applied cheat marks the whole run as cheated permanently. Opening the dialog alone does not. Cheated and non-winning runs still show individual statistics, but only clean victories enter the persistent leaderboard. Each difficulty has a separate list of each account's best individual result. Scoring and tiebreaks are specified in README.md and implemented by the server, not computed from client claims.

## Architecture and data

One Node.js process serves static files and JSON authentication routes with Express, and real-time gameplay with Socket.IO configured for WebSocket. The same Express session middleware authenticates HTTP and socket requests. Passwords are salted and hashed with scrypt. A browser cookie holds the session ID. Duplicate simultaneous connections for one account are rejected; two distinct browser profiles and accounts are required for the pair.

The FIFO queue pairs two authenticated players into an independent room. The first member is host and chooses difficulty. Changing difficulty resets readiness. Both members must be ready before a Game is created. Rooms have independent entities, resources, clocks, cheats and broadcasts. Restart preserves the pair but constructs a fresh Game after both players ready again. Leaving releases the room and notifies the other explorer.

Account and ranking JSON are stored in data files, with serialized writes and atomic replacement. Runtime rooms and sessions are held in memory. No external service is required. The empty submitted data files remain templates; tests use temporary folders. The Canvas renderer and audio use local assets only.

## Balance verification

The parameters are initial implementation settings. A timing target is A1 by 60 seconds, A2/B2 by 150, C3 by 210 and extraction by 240. These are planning milestones, not additional enforced timers. Automated rules tests do not prove that new players understand the route or that every difficulty is balanced. Human two-browser playtesting must check the hard-mode resource supply, altar decay, creature warnings, route length and the final destruction window before final submission.
