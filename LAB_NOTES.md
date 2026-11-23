# Lab code provenance

ASHFALL builds on the course lab application patterns below. The survival rules, authoritative simulation, procedural art and interface are project-specific extensions. The provided labs remain the basis of the web-server, authentication, browser-session, game-room and Canvas collision structure.

| Provided source | Project adaptation |
| --- | --- |
| Lab 5 `game_room/game_server.js` | `server.js` retains Express JSON requests, static serving, `express-session`, registration/sign-in/validation/sign-out routes and browser session maintenance. Routes use the `/api` prefix. Regenerating a session on sign-in, HTTP status codes and shared Socket.IO authentication were added. |
| Lab 5 `game_room/game_server.js` account handling | `server/store.js` extends JSON user records, hashed passwords and the second duplicate check after asynchronous hashing. Node's built-in scrypt replaces Argon2 to avoid a native installation dependency. Writes are serialized and atomically renamed. |
| Lab 5 `game_room/public/scripts/game_room.js` | `public/js/app.js` adapts form submission prevention, field validation, fetch-based registration/sign-in, session restoration, visible errors and sign-out transitions. Native DOM methods replace jQuery for the redesigned interface. |
| Lab 6 `hand_game/game_server.js` | `server.js` uses Express with one HTTP server and one Socket.IO server. `server/rooms.js` extends join validation, per-player readiness, automatic start, player-state broadcasting, end/restart and disconnect handling into independent two-player rooms. |
| Lab 6 `hand_game/public/scripts/hand_game.js` | `public/js/app.js` adapts connection errors, joining, readiness, server-driven screen changes, player-status updates and game-over/restart events. Turns and hand-sign selection are replaced by continuous real-time inputs. |
| Lab 3 `gem_rush/bounding_box.js` | `public/shared/bounding-box.js` retains the box boundary getters, corner points, point testing, intersection and random-point interface. Numeric tests replace Canvas `Path2D` so collision works on the authoritative Node.js server as well as in a browser. Intersection also handles crossing rectangles with no enclosed corners. |
| Lab 3 `gem_rush/player.js` and `sprite.js` update/draw pattern | Movement remains bounded by collision checks and drawing is separate from updates. Server-side elapsed-time movement replaces the original four-direction, fixed-frame update, while `requestAnimationFrame` draws procedural animated explorers instead of the supplied sprite sheet. |

Local lab source paths are documented for provenance; the application has no runtime dependency on sibling lab folders. No lab account data, user credentials or local machine paths are included in the repository. The course handout and original non-English planning documents are provided separately.

General web libraries are limited to Express, Express sessions and Socket.IO. There is no Phaser, Three.js or other game-development framework. `socket.io-client` and JSDOM are development-only testing dependencies.
