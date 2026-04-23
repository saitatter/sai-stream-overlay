# Overlay Refactor Roadmap

Status date: 2026-04-23

Progress:
- [x] Task 1 - WebSocket resilience and status
- [x] Task 2 - Input and payload hardening
- [x] Task 3 - Config and settings cleanup
- [x] Task 4 - Chat lifecycle robustness
- [x] Task 5 - Animation and CSS cleanup
- [x] Task 6 - Code structure polish
- [x] Task 7 - Observability
- [x] Task 8 - Tooling baseline
- [x] Task 9 - Tests
- [x] Task 10 - Documentation

## Task 1 - WebSocket resilience and status
- Goal: make connection behavior predictable during disconnects/restarts.
- Scope:
  - Add reconnect jitter to avoid synchronized reconnect spikes.
  - Add connect timeout for stale `CONNECTING` sockets.
  - Expose connection state to UI (`connecting`, `connected`, `reconnecting`, `disconnected`).
- Acceptance:
  - Reconnect delays are backoff + jitter.
  - Status indicator changes state during connect/disconnect.
  - No breaking change for current default `ws://localhost:8080`.

## Task 2 - Input and payload hardening
- Goal: avoid malformed inputs from breaking rendering.
- Scope:
  - Clamp message length and username length.
  - Limit badges per message.
  - Guard invalid packet shapes and unexpected types.
- Acceptance:
  - Invalid payloads are ignored safely.
  - Overlay remains stable under malformed events.

## Task 3 - Config and settings cleanup
- Goal: separate runtime-only config from shareable style config.
- Scope:
  - Keep `wsUrl` as runtime param only.
  - Preserve style params in share URL.
  - Define a small config contract in one module.
- Acceptance:
  - Copy URL excludes private/runtime-only params unless explicitly requested.
  - Config module is single source of truth.

## Task 4 - Chat lifecycle robustness
- Goal: keep animation smooth during burst traffic.
- Scope:
  - Optional queue for burst mode.
  - Message dedupe (short sliding window).
  - Make max visible messages configurable.
- Acceptance:
  - No UI stutter on high message bursts.
  - Duplicate message floods are reduced.

## Task 5 - Animation and CSS cleanup
- Goal: unify timing and motion behavior.
- Scope:
  - Move timing constants to CSS custom properties where possible.
  - Align JS and CSS duration sources.
  - Add `prefers-reduced-motion` fallback.
- Acceptance:
  - One source of truth for durations.
  - Motion-reduced users get non-intrusive transitions.

## Task 6 - Code structure polish
- Goal: improve maintainability for future contributors.
- Scope:
  - Add JSDoc types for packet shapes.
  - Split platform parsers (`twitch`, `youtube`).
  - Keep orchestration logic thin.
- Acceptance:
  - Parser behavior is self-documented.
  - File responsibilities are clear.

## Task 7 - Observability
- Goal: make runtime issues diagnosable without code changes.
- Scope:
  - Add logger with levels.
  - Add `debug=true` query flag.
  - Add lightweight counters for reconnect and dropped packets.
- Acceptance:
  - Debug mode provides actionable logs.
  - Normal mode remains quiet.

## Task 8 - Tooling baseline
- Goal: keep code quality consistent.
- Scope:
  - Add ESLint and Prettier config.
  - Add npm scripts (`lint`, `format`, `check`).
  - Optional pre-commit checks.
- Acceptance:
  - Linting can run in CI and locally.
  - Formatting is deterministic.

## Task 9 - Tests
- Goal: protect critical behavior from regressions.
- Scope:
  - Unit tests for parser/config.
  - Fake-timer tests for reconnect backoff behavior.
  - Basic integration smoke for settings + ws config.
- Acceptance:
  - Critical runtime paths have test coverage.
  - Reconnect behavior is deterministic under test.

## Task 10 - Documentation
- Goal: reduce onboarding time and production confusion.
- Scope:
  - Add architecture section.
  - Add troubleshooting for WS lifecycle.
  - Add examples for local and remote Streamer.bot setup.
- Acceptance:
  - New contributor can understand module map quickly.
  - Operators can diagnose common failures from docs.
