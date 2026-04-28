# sai-stream-overlay

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![GitHub Release](https://img.shields.io/github/v/release/saitatter/sai-stream-overlay)
[![Issues](https://img.shields.io/github/issues/saitatter/sai-stream-overlay)](https://github.com/saitatter/sai-stream-overlay/issues)
![Made with JavaScript](https://img.shields.io/badge/Made%20with-JavaScript-yellow?logo=javascript)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![OBS Studio](https://img.shields.io/badge/OBS%20Studio-302E31?logo=obsstudio&logoColor=white)
![Streamer.bot Ready](https://img.shields.io/badge/Streamer.bot-Ready-blue)
![Google Fonts](https://img.shields.io/badge/Google%20Fonts-Supported-orange)

> Stream overlay runtime for chat and scene overlays, packaged for **OBS Browser Source** (Docker).

_(Add a short demo gif here for instant context)_  
`https://github.com/saitatter/sai-stream-overlay/assets/XXXX/demo.gif`

---

## ✨ Features

- 🎨 Live customization: colors, fonts (Google Fonts), background opacity
- ⏱ Adjustable message fade time
- 🧼 Smooth, synchronized slide animations (overflow & auto-expire)
- 🔖 Badges rendering for users
- 🔌 Streamer.bot integration (Twitch `ChatMessage`, YouTube `Message`)
- 🎬 Scene overlay runtime with versioned manifests and WebGL shader presets
- 🚨 Alert overlay runtime for donations and generic alert events
- 🧩 Resource overlay runtime for WYSIWYG labels and panels from SAI Showrunner
- 🔁 Auto-reconnect with exponential backoff if WebSocket disconnects
- 🐳 Docker image on GHCR (`latest` for amd64, version tags are multi-arch)

---

## 🚀 Quick Start

### Docker (recommended)

```bash
docker pull ghcr.io/saitatter/sai-stream-overlay:latest
docker run -d -p 8080:80 ghcr.io/saitatter/sai-stream-overlay:latest
```

Add a Browser Source in OBS pointing to:

```
http://localhost:8080/?edit=false&twitchColor=%239146FF&youtubeColor=%23FF0000&msgBgColor=%23000000&msgBgOpacity=0.6&fadeTime=8&fontFamily=Poppins
```

> 💡 Tip: Append `?edit=true` to open the in-page settings panel for live customization. Fonts are loaded via Google Fonts and must be in the internal allowlist.

### Moderation service mode

By default, the overlay keeps its legacy direct Streamer.bot connection. To render
messages approved by `sai-moderation-docker`, point the overlay at the moderation
overlay WebSocket:

```
http://localhost:8080/?eventSource=moderation&overlayWsUrl=ws%3A%2F%2Flocalhost%3A8787%2Fws%3Fchannel%3Doverlay
```

Use `&demo=true` to render sample moderation events without a backend connection.

### Scene overlay mode

Scene overlays use a separate OBS Browser Source page with a procedural WebGL
background and DOM text/countdown layer:

```
http://localhost:8080/overlay/scene.html?instance=main&overlayWsUrl=ws%3A%2F%2Flocalhost%3A8787%2Fws%3Fchannel%3Doverlay&sceneApiUrl=http%3A%2F%2Flocalhost%3A8787
```

Use `&demo=true` to preview the shader scene without the moderation backend.

### Alert overlay mode

Alert overlays use a separate OBS Browser Source page for donation and generic
alert events:

```text
http://localhost:8080/overlay/alert.html?overlayWsUrl=ws%3A%2F%2Flocalhost%3A8787%2Fws%3Fchannel%3Doverlay
```

Use `&demo=true` to preview the alert card without a backend. The runtime
handles:

- `donation.received`
- `alert.begin`
- `alert.update`
- `alert.end`

### Resource overlay mode

Resource overlays render WYSIWYG labels and panels created in SAI Showrunner's
Overlay Studio:

```text
http://localhost:8080/overlay/overlay.html?instance=main&overlayWsUrl=ws%3A%2F%2Flocalhost%3A8787%2Fws%3Fchannel%3Doverlay
```

Use `&demo=true` to preview a sample lower-third without a backend. The runtime
handles:

- `overlay.resource.updated`
- `overlay.state.patch`

Example:

```json
{
  "type": "overlay.resource.updated",
  "target": {
    "instance": "main"
  },
  "payload": {
    "overlayKey": "main-alerts",
    "resource": {
      "key": "main-alerts",
      "name": "Main Alerts",
      "target": {
        "instance": "main"
      },
      "size": {
        "width": 1920,
        "height": 1080
      },
      "nodes": [
        {
          "id": "latest-follower-label",
          "type": "label",
          "text": "Latest follower",
          "binding": "platform.twitch.latestFollower.displayName",
          "x": 96,
          "y": 820,
          "width": 520,
          "height": 72,
          "style": {
            "fontSize": 42,
            "color": "#ffffff",
            "backgroundColor": "#000000",
            "opacity": 0
          }
        }
      ]
    }
  }
}
```

After a resource is loaded, Showrunner can update bound labels without sending
the full overlay again:

```json
{
  "type": "overlay.state.patch",
  "target": {
    "instance": "main"
  },
  "payload": {
    "path": "platform.twitch.latestFollower.displayName",
    "value": "ViewerName"
  }
}
```

Scene events are consumed from the overlay WebSocket channel:

```json
{
  "type": "scene.begin",
  "target": {
    "overlay": "scene",
    "instance": "main"
  },
  "payload": {
    "sceneKey": "starting-soon",
    "title": "Starting Soon",
    "subtitle": "Stream begins shortly",
    "fragmentShader": "precision highp float; void main() { gl_FragColor = vec4(1.0); }",
    "parameters": {
      "accentColor": "#9146FF",
      "secondaryColor": "#00D1FF",
      "intensity": 0.8
    }
  }
}
```

`payload.fragmentShader` is optional. When present on `scene.begin` or
`scene.update`, it is compiled as the active fragment shader for that event. If
it is absent or blank, the runtime uses the scene manifest's `fragmentShader`
asset, then falls back to the built-in shader. Inline shader payloads are capped
at 50 KB to avoid accidental oversized event frames.

The runtime reports scene health back through the same WebSocket when the event
hub accepts client-to-server messages, and also dispatches a local
`sai-scene-status` browser event. Status packets use `type: "scene.status"` with
`payload.lifecycle` values such as `compile-ok`, `compile-error`, `applied`, and
`idle`.

---

## ⚙️ Configuration (URL params)

| Param            | Type    | Default                                  | Example                                  | Notes                                                                          |
| ---------------- | ------- | ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `edit`           | bool    | `false`                                  | `true`                                   | Shows settings panel                                                           |
| `twitchColor`    | hex     | `#9146FF`                                | `%239146FF`                              | URL-encode `#` as `%23`                                                        |
| `youtubeColor`   | hex     | `#FF0000`                                | `%23FF0000`                              | —                                                                              |
| `msgBgColor`     | hex     | `#000000`                                | `%23000000`                              | Combined with `msgBgOpacity`                                                   |
| `msgBgOpacity`   | 0–1     | `0.6`                                    | `0.8`                                    | Final bg: `rgba(color, opacity)`                                               |
| `fadeTime`       | seconds | `8`                                      | `12`                                     | Message lifetime                                                               |
| `fontFamily`     | string  | `Poppins`                                | `Roboto`                                 | Must exist in the internal Google Fonts list                                   |
| `wsUrl`          | ws/wss  | `ws://localhost:8080`                    | `ws://127.0.0.1:8080`                    | Runtime endpoint; not included by Copy URL                                     |
| `eventSource`    | string  | `streamerbot`                            | `moderation`                             | `streamerbot` connects directly; `moderation` consumes approved overlay events |
| `overlayWsUrl`   | ws/wss  | `ws://localhost:8787/ws?channel=overlay` | `ws://127.0.0.1:8787/ws?channel=overlay` | Moderation overlay channel endpoint                                            |
| `demo`           | bool    | `false`                                  | `true`                                   | Emits sample moderation events locally                                         |
| `sceneApiUrl`    | http(s) | `http://localhost:8787`                  | `http://127.0.0.1:8787`                  | Scene overlay restore endpoint                                                 |
| `sceneAssetBase` | path    | `scenes`                                 | `scenes`                                 | Scene definition directory relative to `scene.html`                            |
| `maxMessages`    | number  | `10`                                     | `15`                                     | Max visible chat bubbles (1..50)                                               |
| `debug`          | bool    | `false`                                  | `true`                                   | Enables verbose debug logging/metrics                                          |

---

## 🔌 Streamer.bot Setup

1. Enable **WebSocket** in Streamer.bot (overlay default is `ws://localhost:8080`).
2. The overlay subscribes to:
   - Twitch: `ChatMessage`
   - YouTube: `Message`
3. If needed, override endpoint from URL with `wsUrl` (for example `?wsUrl=ws://127.0.0.1:8080`).
4. Ensure OBS can reach both the overlay and Streamer.bot WS endpoint.

---

## 🧪 Local Development

```bash
# Clone
git clone https://github.com/saitatter/sai-stream-overlay.git
cd sai-stream-overlay

# Serve statically
npm i -g serve
serve -l 8080 .
```

Then open:  
`http://localhost:8080/?edit=true`

---

## 🧱 Architecture

- `overlay/script.js`: app orchestration (wires modules together).
- `overlay/js/settings.js`: URL/UI settings handling and share-link generation.
- `overlay/js/websocket.js`: Streamer.bot socket client, reconnect/backoff, status, metrics.
- `overlay/js/parsers.js`: platform-specific payload extraction with minimal shape checks.
- `overlay/js/chat.js`: message queue, DOM rendering, overflow compaction.
- `overlay/js/animations.js`: coordinated remove/shift animations.
- `overlay/js/config.js`: runtime config parsing (`wsUrl`, `maxMessages`, `debug`).
- `overlay/overlay.html`: WYSIWYG resource overlay entrypoint.
- `overlay/js/overlay-runtime.js`: Overlay Studio resource renderer.
- `overlay/scene.html`: scene overlay entrypoint.
- `overlay/js/scene-runtime.js`: scene event client, scene definition loader, and WebGL runtime.
- `overlay/scenes/*`: versioned scene manifests and shader assets.

---

## 🐳 Docker

### Local build

```bash
docker build -t ghcr.io/saitatter/sai-stream-overlay:dev .
docker run -d -p 8080:80 ghcr.io/saitatter/sai-stream-overlay:dev
```

### CI images (from GitHub Actions)

- `latest`: **amd64** (single-platform) → clean GHCR entry
- versioned tags (e.g. `1.0.3`): **multi-arch** (`amd64`, `arm64`)

```bash
docker pull ghcr.io/saitatter/sai-stream-overlay:1.0.3
```

---

## 🔄 Releases

Uses **semantic-release** with Conventional Commits.  
On every push to `main`, CI checks if a new version should be published. Feature branches do not publish releases.  
If no `feat`/`fix`/`perf`/`refactor` (or breaking change) is detected, no release is created.

- Use Conventional Commits: `feat: ...`, `fix: ...`, `perf: ...`, `refactor: ...`
- Squash merges are supported: conventional commit lines kept in the squash commit body are expanded into individual changelog entries, matching the `pylrcget` release style.
- Breaking changes:
  ```
  BREAKING CHANGE: description...
  ```

---

## 🛠 Troubleshooting

- **Blank overlay in OBS** — Check URL and that container is reachable.
- **No messages appear** — Verify Streamer.bot is running and WS URL matches.
- **`WS: reconnecting` persists** — Check Streamer.bot WebSocket host/port, firewall rules, and whether OBS/container can reach that endpoint.
- **Need more WS diagnostics** — Add `&debug=true` to the overlay URL and inspect browser console logs.
- **Fonts not applying** — Ensure family is in allowlist and Google Fonts is reachable.
- **Multiple `latest` entries in GHCR** — CI publishes single-platform `latest` and multi-arch only for version tags.

---

## 🤝 Contributing

PRs are welcome! Please:

- Keep commits small and conventional.
- When squash merging, keep the branch commit list in the squash body so every conventional commit appears in the release changelog.

---

## 📄 License

MIT © saitatter
