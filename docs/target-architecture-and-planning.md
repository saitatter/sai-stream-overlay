# Target Architecture and Planning

Status date: 2026-04-28

This document describes the intended direction for `sai-stream-overlay`: move from a
single OBS chat overlay that connects directly to Streamer.bot into a small overlay
platform with a moderation service, normalized events, and multiple frontend
overlays.

## Goals

- Keep Streamer.bot integration and moderation decisions out of OBS browser
  overlays.
- Let OBS overlays stay lightweight, display-focused, and safe to reload.
- Support multiple overlay types from one event contract:
  - chat messages
  - donations
  - alerts
  - scene begin/end screens
  - intermission widgets
  - future custom stream events
- Add a separate OBS dock frontend for moderation and operator controls.
- Make the architecture easy to run locally with Docker and easy to deploy as a
  streamer-owned stack.

## Current Architecture

```text
Streamer.bot WebSocket
        |
        v
sai-stream-overlay frontend in OBS Browser Source
        |
        v
parse Twitch/YouTube events, render chat bubbles
```

Current responsibilities inside this repo:

- connect directly to Streamer.bot
- subscribe to Twitch and YouTube chat events
- parse platform-specific payloads
- render chat messages
- expose a small edit/settings panel
- manage reconnect and debug metrics

This works for a chat-only overlay, but it makes the OBS browser source
responsible for too many things once moderation, queueing, donations, and
multiple overlay surfaces are introduced.

## Target Architecture

```text
                         +---------------------------+
                         | Streamer.bot WebSocket    |
                         +-------------+-------------+
                                       |
                                       v
                         +---------------------------+
                         | moderation service        |
                         | Docker container          |
                         |                           |
                         | - Streamer.bot adapter    |
                         | - event normalization     |
                         | - moderation rules        |
                         | - event routing           |
                         | - overlay WebSocket/SSE   |
                         | - admin API               |
                         +------+------+-------------+
                                |      |
                 approved events|      |operator API
                                |      |
                                v      v
          +-----------------------+   +--------------------------+
          | overlay frontend(s)   |   | moderation OBS dock      |
          | OBS Browser Sources   |   | separate frontend        |
          |                       |   |                          |
          | - chat overlay        |   | - pending queue          |
          | - donation overlay    |   | - approve/reject         |
          | - scene overlays      |   | - filters/settings       |
          | - alert overlays      |   | - diagnostics            |
          +-----------------------+   +--------------------------+
```

## Services

### 1. Moderation Service

The moderation service becomes the backend source of truth.

Responsibilities:

- connect to Streamer.bot
- subscribe to raw Streamer.bot events
- normalize platform-specific payloads into a stable internal event shape
- run moderation filters and routing rules
- expose approved events to OBS overlays
- expose pending/rejected/approved queues to the moderation dock
- hold runtime state, counters, and diagnostics
- optionally persist settings, rules, and overlay presets

Recommended first implementation:

- Node.js service, because the current project is already JavaScript-based
- WebSocket server for overlays
- HTTP JSON API for dock/admin actions
- in-memory queues for MVP
- optional SQLite persistence after the event contract stabilizes

### 2. Overlay Frontends

OBS overlays should become display clients. They should not know Streamer.bot
packet shapes.

Responsibilities:

- connect to the moderation service overlay endpoint
- subscribe to one or more overlay channels
- render normalized events
- expose style-only settings through URL params or presets
- handle reconnect and visual fallback states

The current `sai-stream-overlay` can evolve into the first overlay frontend:

- replace direct Streamer.bot subscription with moderation-service subscription
- change parsers from Streamer.bot payload parsers to normalized event parsers
- keep current chat rendering, animations, theme params, and OBS-friendly behavior

### 3. Moderation OBS Dock

The dock is a separate frontend loaded as an OBS custom browser dock.

Responsibilities:

- show live incoming events
- show pending moderation queue
- approve, reject, hold, pin, or replay events
- edit filter rules
- control overlay state, for example pause chat or trigger scene overlays
- show connection diagnostics

This frontend should not be mixed into the overlay browser sources. OBS overlays
need transparent backgrounds and tiny runtime behavior; the dock needs dense
operator UI.

## Event Transport

Recommended MVP transport:

- Moderation service connects to Streamer.bot via WebSocket.
- Overlays connect to moderation service via WebSocket.
- Dock talks to moderation service via HTTP for commands and WebSocket for live
  updates.

Possible endpoints:

```text
GET  /health
GET  /api/settings
PUT  /api/settings
GET  /api/moderation/queue
POST /api/events/:id/approve
POST /api/events/:id/reject
POST /api/events/:id/replay
WS   /ws/overlays
WS   /ws/dock
```

Overlay connection example:

```text
ws://localhost:8090/ws/overlays?client=chat-main&channels=chat,donation
```

Dock connection example:

```text
ws://localhost:8090/ws/dock
```

## Normalized Event Contract

All events should share a small envelope.

```json
{
  "version": 1,
  "id": "evt_01J...",
  "type": "chat.message",
  "source": "twitch",
  "status": "approved",
  "createdAt": "2026-04-28T08:00:00.000Z",
  "receivedAt": "2026-04-28T08:00:00.120Z",
  "display": {
    "priority": "normal",
    "durationMs": 10000,
    "theme": "default"
  },
  "actor": {
    "id": "123",
    "name": "viewername",
    "displayName": "ViewerName",
    "badges": []
  },
  "payload": {}
}
```

Shared fields:

- `version`: event schema version
- `id`: stable event id created by the moderation service
- `type`: normalized event type
- `source`: `twitch`, `youtube`, `streamerbot`, `manual`, or future source
- `status`: `pending`, `approved`, `rejected`, `held`, or `system`
- `createdAt`: platform/event timestamp when known
- `receivedAt`: moderation service timestamp
- `display`: overlay hints, not business rules
- `actor`: user/viewer/trigger actor, when relevant
- `payload`: type-specific data

For chat actors, `actor.name` should be the stable platform login or unique
handle when available, while `actor.displayName` is the presentation label shown
in overlays.

### Chat Message

```json
{
  "version": 1,
  "id": "evt_chat_01J...",
  "type": "chat.message",
  "source": "twitch",
  "status": "approved",
  "createdAt": "2026-04-28T08:00:00.000Z",
  "receivedAt": "2026-04-28T08:00:00.120Z",
  "actor": {
    "id": "123",
    "name": "viewername",
    "displayName": "ViewerName",
    "badges": [
      {
        "type": "moderator",
        "label": "Moderator",
        "imageUrl": "https://example.com/mod.png"
      }
    ]
  },
  "payload": {
    "message": "Hello chat!",
    "emotes": [],
    "isAction": false,
    "isFirstMessage": false
  },
  "display": {
    "priority": "normal",
    "durationMs": 10000,
    "theme": "default"
  }
}
```

### Donation or Paid Message

```json
{
  "version": 1,
  "id": "evt_donation_01J...",
  "type": "donation.received",
  "source": "youtube",
  "status": "approved",
  "actor": {
    "id": "456",
    "name": "supporter",
    "displayName": "Supporter"
  },
  "payload": {
    "amount": 10,
    "currency": "EUR",
    "formattedAmount": "10.00 EUR",
    "message": "Great stream!",
    "provider": "youtube"
  },
  "display": {
    "priority": "high",
    "durationMs": 15000,
    "theme": "donation-default"
  }
}
```

### Overlay Scene Event

Scene overlays should be controlled by explicit events instead of hard-coded URL
modes.

```json
{
  "version": 1,
  "id": "evt_scene_01J...",
  "type": "scene.begin",
  "source": "manual",
  "status": "system",
  "payload": {
    "sceneKey": "starting-soon",
    "title": "Starting Soon",
    "subtitle": "Stream begins shortly",
    "countdownEndsAt": "2026-04-28T08:15:00.000Z",
    "fragmentShader": "precision highp float; void main() { gl_FragColor = vec4(1.0); }",
    "parameters": {
      "accentColor": "#9146FF",
      "intensity": 0.8,
      "shaderPreset": "aurora"
    }
  },
  "display": {
    "priority": "system",
    "durationMs": 0,
    "theme": "starting-soon"
  }
}
```

Possible scene event types:

- `scene.begin`
- `scene.end`
- `scene.update`
- `scene.countdown.started`
- `scene.countdown.finished`

## Overlay Types

### Chat Overlay

First migration target because this repo already implements it.

Initial behavior:

- subscribe to `chat.message`
- render only events with `status: approved`
- use `actor.displayName`, `payload.message`, `source`, and `actor.badges`
- keep existing style params

Later behavior:

- render emotes
- highlight moderator/subscriber/member messages
- support pinned messages
- support compact, vertical, and ticker layouts

### Donation Overlay

Dedicated overlay surface for paid messages and external donation providers.

Event types:

- `donation.received`
- `donation.goal.updated`
- `donation.goal.reached`

Expected UI:

- high-priority animated alert
- optional queue if multiple donations arrive together
- amount, currency, display name, message
- replay support from moderation dock

### Alert Overlay

Generic overlay for follows, subscribes, memberships, raids, milestones, and
manual triggers.

Event types:

- `alert.follow`
- `alert.subscribe`
- `alert.member`
- `alert.raid`
- `alert.manual`

Expected UI:

- queue-based rendering
- per-alert templates
- optional sound hooks
- replay from dock

### Scene Overlay

Long-lived overlays for show states.

Examples:

- starting soon
- be right back
- ending soon
- stream ended
- intermission

Event types:

- `scene.begin`
- `scene.update`
- `scene.end`

Expected UI:

- persistent state until replaced or ended
- countdown support
- title/subtitle/media slots
- manual control from dock

## Scene Runtime Architecture

Scene overlays should be built as long-running OBS browser sources that listen
for scene events and render the active scene state. The browser source should not
reload when switching from `starting-soon` to `brb` or `ending`; the moderation
service sends `scene.begin`, `scene.update`, and `scene.end` events, and the
runtime transitions between scene definitions.

Recommended first shape:

```text
OBS Browser Source
        |
        v
/overlays/scene/?instance=main&channels=scene
        |
        v
scene runtime
        |
        +--> connects to WS /ws/overlays
        +--> receives scene events
        +--> loads registered scene definition
        +--> updates uniforms/state/DOM/canvas
        +--> renders until replaced or ended
```

The important split:

- `scene runtime`: common code for connection, routing, transitions, timers, and
  lifecycle.
- `scene definition`: one visual scene, for example `starting-soon`,
  `intermission`, `brb`, or `ending`.
- `scene parameters`: safe values sent from the dock/service, such as text,
  countdown time, colors, speed, intensity, media keys, or shader preset names.

### Scene Definition Types

The runtime should support several rendering modes over time.

```text
scenes/
  starting-soon/
    scene.json
    index.js
    style.css
  brb/
    scene.json
    index.js
    fragment.glsl
  ending/
    scene.json
    index.js
```

Possible scene modes:

- `dom`: HTML/CSS scene with text, panels, images, and simple animation
- `canvas2d`: procedural 2D scene
- `webgl-shader`: full-screen fragment shader scene
- `three`: Three.js scene for 3D or more complex WebGL visuals
- `hybrid`: WebGL/canvas background with DOM text and widgets above it

The MVP can start with `dom` and `webgl-shader`. That gives us practical OBS
screens quickly while leaving room for procedural scenes.

### Shader and Procedural Scenes

Custom shaders should be treated as registered assets, not arbitrary code pasted
through the dock.

Recommended model:

- shader files live in the overlay project or in a trusted local asset directory
- each shader preset has a manifest entry
- the dock can choose the preset and edit allowed parameters
- the moderation service stores active scene state and broadcasts safe parameter
  updates
- the OBS browser source compiles/runs the shader locally

Example manifest:

```json
{
  "key": "starting-soon-aurora",
  "label": "Starting Soon - Aurora",
  "mode": "webgl-shader",
  "fragmentShader": "fragment.glsl",
  "defaults": {
    "accentColor": "#9146FF",
    "secondaryColor": "#00D1FF",
    "speed": 0.35,
    "intensity": 0.8
  },
  "controls": [
    {
      "key": "accentColor",
      "type": "color",
      "label": "Accent Color"
    },
    {
      "key": "speed",
      "type": "range",
      "label": "Speed",
      "min": 0,
      "max": 2,
      "step": 0.01
    },
    {
      "key": "intensity",
      "type": "range",
      "label": "Intensity",
      "min": 0,
      "max": 1,
      "step": 0.01
    }
  ]
}
```

For shader scenes, the runtime should expose standard uniforms:

- `u_time`: seconds since scene started
- `u_resolution`: canvas size in pixels
- `u_accentColor`: normalized RGB
- `u_secondaryColor`: normalized RGB
- `u_intensity`: scene intensity
- `u_progress`: transition or countdown progress when relevant

Scene event updates should change uniforms without recompiling the shader unless
the selected preset changes. During cross-repo runtime work, the overlay also
accepts an optional `payload.fragmentShader` on `scene.begin` and `scene.update`
for trusted event hubs that need to inline a fragment shader. Inline shaders
override the scene manifest shader for that event; absent, blank, or oversized
inline shaders fall back to the manifest shader, then the built-in shader.

### Scene Runtime Status Events

Scene overlays should report runtime health to the moderation/event hub when the
overlay WebSocket supports client-to-server messages. The current payload is also
dispatched locally as a `sai-scene-status` browser event so tests, diagnostics,
or OBS browser tooling can observe the same contract.

```json
{
  "version": 1,
  "type": "scene.status",
  "source": "overlay",
  "status": "system",
  "createdAt": "2026-04-28T08:00:00.000Z",
  "target": {
    "overlay": "scene",
    "instance": "main"
  },
  "payload": {
    "sceneKey": "starting-soon",
    "lifecycle": "compile-error",
    "severity": "error",
    "message": "Scene shader compilation failed; previous shader remains active.",
    "detail": "ERROR: 0:1: syntax error",
    "shaderSource": "inline"
  }
}
```

`payload.lifecycle` currently includes `compile-ok`, `compile-error`, `applied`,
and `idle`. `payload.shaderSource` is `inline`, `manifest`, or `builtin`.

### Scene Instance Binding

OBS can have multiple browser sources that use the same scene runtime with
different instance names.

Examples:

```text
http://localhost:8080/overlays/scene/?instance=main
http://localhost:8080/overlays/scene/?instance=background
http://localhost:8080/overlays/scene/?instance=lower-third
```

The moderation service routes events by instance:

```json
{
  "version": 1,
  "id": "evt_scene_01J...",
  "type": "scene.begin",
  "source": "manual",
  "status": "system",
  "target": {
    "overlay": "scene",
    "instance": "main"
  },
  "payload": {
    "sceneKey": "starting-soon",
    "parameters": {
      "title": "Starting Soon",
      "shaderPreset": "starting-soon-aurora"
    }
  }
}
```

This allows one dock action to control a specific OBS source without affecting
other overlays.

### Dock Controls for Scenes

The moderation dock should act like a control surface:

- choose active scene for each instance
- edit scene parameters generated from `scene.json`
- start, update, end, and replay scene events
- preview scene state before pushing it live
- save presets such as `starting-soon-purple`, `brb-minimal`, or
  `ending-credits`
- optionally bind dock buttons to Streamer.bot actions or hotkeys

The dock should not send raw shader code as part of normal operation. It should
select known scene definitions and send validated parameter updates. That keeps
OBS browser sources stable during a live stream.

### Scene Lifecycle

```text
dock selects "starting-soon"
        |
        v
POST /api/scenes/main/begin
        |
        v
moderation service stores active scene state
        |
        v
broadcast scene.begin to /ws/overlays
        |
        v
scene OBS source loads definition and renders
        |
        +--> scene.update changes text, countdown, colors, uniforms
        |
        +--> scene.end transitions to idle or next scene
```

The service should keep the latest active state per scene instance. When OBS
reloads the browser source, the scene overlay can reconnect and request or
receive the current state instead of starting blank.

## Moderation Flow

```text
raw Streamer.bot event
        |
        v
normalize event
        |
        v
apply rules
        |
        +--> auto-approved --> overlay broadcast
        |
        +--> pending -------> dock queue --> approve --> overlay broadcast
        |
        +--> rejected ------> audit/metrics only
```

Rule examples:

- reject blocked words
- hold messages containing links
- hold first-time chatters
- reject bot commands starting with `!`
- auto-approve trusted users
- priority boost for donations or moderator messages

## Suggested Repository Direction

There are two viable paths.

### Option A: Keep This Repo as Overlay Frontend Only

Create a separate repo for the moderation service and dock.

Pros:

- clean ownership
- this repo stays simple and OBS-focused
- release lifecycle is easier for overlays

Cons:

- shared event contracts must be duplicated or published separately
- local development requires multiple repos

### Option B: Convert to a Monorepo

Evolve this repo into a small workspace.

Possible structure:

```text
apps/
  overlays/
    chat/
    donation/
    scene/
  moderation-dock/
  moderation-service/
packages/
  event-contracts/
  overlay-client/
  ui/
docs/
```

Pros:

- one Docker Compose stack
- shared contracts and clients
- easier to evolve the platform quickly

Cons:

- bigger refactor
- tooling decisions need to be made earlier

Recommended direction:

Start with Option A behaviorally, but keep contracts portable. Do not refactor
into a monorepo until the moderation service and event schema prove themselves.

## Migration Plan

### Phase 0 - Architecture Agreement

Goal: lock the target contract and service boundaries.

Tasks:

- agree that overlays consume normalized moderation-service events
- choose initial service ports
- choose event transport for MVP
- decide whether moderation service lives in this repo or a new repo
- define the first version of `chat.message`

Acceptance:

- this document is reviewed and updated with final decisions
- first implementation tickets can be created from Phase 1

### Phase 1 - Overlay Client Compatibility Layer

Goal: make this frontend able to consume the future moderation service without
breaking direct Streamer.bot mode immediately.

Tasks:

- add `eventSource` config with values `streamerbot` and `moderation`
- add `overlayWsUrl`, defaulting to the moderation service endpoint
- add parser for normalized `chat.message`
- keep current Streamer.bot parser as legacy mode during migration
- update README with both modes

Acceptance:

- existing Streamer.bot direct mode still works
- mock normalized events can render in the current chat overlay
- tests cover normalized chat parsing

### Phase 2 - Moderation Service MVP

Goal: create the backend that connects to Streamer.bot and rebroadcasts approved
chat events.

Tasks:

- create moderation service Docker container
- connect to Streamer.bot WebSocket
- normalize Twitch `ChatMessage` and YouTube `Message`
- apply simple auto-approve rules
- expose `WS /ws/overlays`
- expose `GET /health`
- add Docker Compose for local stack

Acceptance:

- OBS chat overlay can connect to moderation service
- chat messages render through the new pipeline
- service reconnects to Streamer.bot after restart

### Phase 3 - Moderation Dock MVP

Goal: add operator visibility and manual moderation.

Tasks:

- create OBS dock frontend
- display incoming, approved, rejected, and pending events
- support approve/reject actions
- add pause/resume overlay broadcast
- add basic diagnostics

Acceptance:

- messages can be held and manually approved
- approved events appear in OBS overlay
- rejected events do not reach overlays

### Phase 4 - Overlay Platform Split

Goal: prepare for multiple overlay types.

Tasks:

- extract shared overlay WebSocket client
- define channel subscription format
- define common event envelope validation
- create folder or package boundary for overlay types
- add demo mode for normalized events

Acceptance:

- chat overlay uses shared overlay client
- a second overlay can be added without duplicating connection logic

### Phase 5 - Donation Overlay

Goal: add the first non-chat overlay.

Tasks:

- define `donation.received`
- map donation-like events from Streamer.bot where available
- create donation overlay UI
- queue donation alerts
- add replay from dock

Acceptance:

- donation event can be triggered manually from dock
- donation overlay renders amount, user, and message
- replay works without re-sending the raw source event

### Phase 6 - Scene Overlay System

Goal: support beginning, ending, and intermission screens.

Tasks:

- define `scene.begin`, `scene.update`, and `scene.end`
- add `target.overlay` and `target.instance` routing for scene events
- create the common scene runtime
- add scene definition manifests
- support at least one DOM scene and one WebGL shader scene
- create scene overlay frontend
- add dock controls for starting/ending scenes
- add dock controls generated from scene manifests
- add countdown support
- persist latest active scene state per instance
- add URL/channel config for scene instances

Acceptance:

- dock can trigger `starting-soon`, `brb`, and `ending` states
- scene overlay persists until replaced or ended
- countdown updates without OBS source reload
- shader scene parameters update live without recompiling the shader
- reloading the OBS browser source restores the current scene state

## Initial Technical Decisions

Suggested defaults:

- moderation service port: `8090`
- overlay WebSocket endpoint: `ws://localhost:8090/ws/overlays`
- dock HTTP base URL: `http://localhost:8090`
- dock WebSocket endpoint: `ws://localhost:8090/ws/dock`
- Streamer.bot WebSocket remains configurable, defaulting to
  `ws://localhost:8080`
- event schema starts at `version: 1`

## Open Questions

- Should the moderation service live in this repo or a sibling repo?
- Do we need persistence in MVP, or is in-memory enough for first testing?
- Which donation providers should be supported first?
- Should overlay presets be stored in the moderation service or remain URL-only?
- Should dock authentication be added for LAN use, or deferred until remote access
  is required?
- Should overlays connect with one shared channel socket or separate sockets per
  overlay type?
- Should shader scene assets be bundled with the overlay image only, or should we
  also support a mounted local `scenes/` directory for custom streamer scenes?
- Which rendering modes should be supported in the first scene runtime release:
  DOM only, DOM plus WebGL shaders, or DOM plus Three.js?

## Near-Term Recommended Backlog

1. Add normalized `chat.message` parser to this frontend.
2. Add `eventSource=moderation` URL mode.
3. Add `demo=true` mode that emits normalized events locally.
4. Build moderation service MVP with Streamer.bot adapter and overlay WebSocket.
5. Add Docker Compose for `moderation-service` plus static overlay frontend.
6. Build the moderation dock MVP.
7. Add donation event contract and manual trigger.
8. Add donation overlay.
9. Add scene event contract.
10. Add scene runtime with instance routing.
11. Add starting/ending DOM scene overlay.
12. Add first shader-based procedural scene.
