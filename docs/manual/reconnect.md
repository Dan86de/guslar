# Lose and regain the server

A user whose Guslar server stops, crashes or restarts sees the map say so instead of silently going stale, and the map picks up again by itself when the server is back.

## Entry points

- The server is stopped with Ctrl-C.
- Its terminal is closed.
- It crashes.
- It starts again on the same port.

## Steps

Preconditions: `verify open` has loaded the map.

- **Ctrl-C.** Run `verify server-stop --signal INT`, then `verify wait-for "Reconnecting"`. It prints `stopped guslar (pid <n>) with SIGINT`, then `"Reconnecting" is visible after <n> ms`, and `verify snapshot` ends with a status `The road to the server is cut. Reconnecting…`, after the same six `Regions` items as before.
- **What the user sees.** Run `verify screenshot cut` and open `cut.png`. The map, its fog and both plaques are still on screen, and a dark bar at the bottom centre reads `The road to the server is cut. Reconnecting…` without covering a plaque. This check is about the bar; the fog is judged in [Open the world](./open-the-world.md). The bar sits on the town's south wall and gate, which is fine: it only must not cover a plaque. Take close-ups of the bar only, around (420, 780, 600, 120) at 1440x900, and quickly: the server is down, and lingering lets the reconnect backoff grow.
- **It comes back.** Run `verify server-start`, then `verify wait-for "Reconnecting" --gone`. It prints `"Reconnecting" is gone after <n> ms`, with `<n>` under 5500.
- **The map is live again.** Run `verify snapshot`: the same six `Regions` items, and no status. Run `verify doctor`: `fit`, with the new pid and the same URL.
- **Its terminal is closed.** Run `verify server-stop --signal HUP`, then `verify wait-for "Reconnecting"`. It prints `with SIGHUP`, then `"Reconnecting" is visible after <n> ms`. Run `verify server-start`, then `verify wait-for "Reconnecting" --gone`: `"Reconnecting" is gone after <n> ms`, with `<n>` under 5500.
- **It crashes.** Run `verify server-stop --signal KILL`, then `verify wait-for "Reconnecting"`. It prints `with SIGKILL`, then `"Reconnecting" is visible after <n> ms`. Run `verify server-start`, then `verify wait-for "Reconnecting" --gone`: `"Reconnecting" is gone after <n> ms`, with `<n>` under 5500. Run `verify doctor`: `fit`.

## Behind it

- **Each restart keeps the URL.** Every `server-start` prints the same `http://127.0.0.1:<port>/` that `start` did, with `same port as before`.

## Gotchas

- The map retries with backoff up to five seconds apart, so the notice can take that long to leave after the server is back. Lingering over a step while the server is down lets the backoff reach its five-second cap, which is why the bound is 5500 ms rather than a tight one.
- Before the first world arrives there is no notice at all: the notice is about losing a server the map already had.
- `<n>` in `wait-for` counts from when `wait-for` started, after `server-start` returned, not from the moment the server was back.
