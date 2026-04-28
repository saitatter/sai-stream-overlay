import { createLogger } from "./logger.js";

const DEFAULT_OVERLAY_WS_URL = "ws://localhost:8787/ws?channel=overlay";
const DEFAULT_SCENE_API_URL = "http://localhost:8787";
const DEFAULT_SCENE_ASSET_BASE = "scenes";
const IDLE_SCENE = {
  sceneKey: "idle",
  title: "",
  subtitle: "",
  kicker: "",
  countdownEndsAt: "",
  parameters: {},
};

const vertexShaderSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_accentColor;
uniform vec3 u_secondaryColor;
uniform float u_intensity;

float wave(vec2 uv, float speed, float scale) {
  return sin((uv.x * scale) + (u_time * speed)) * cos((uv.y * (scale * 0.64)) - (u_time * speed));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 centered = uv - 0.5;
  centered.x *= u_resolution.x / max(u_resolution.y, 1.0);

  float radius = length(centered);
  float aurora = wave(centered + vec2(0.0, sin(u_time * 0.08) * 0.12), 0.55, 8.0);
  aurora += wave(centered.yx + vec2(cos(u_time * 0.07) * 0.08, 0.0), 0.34, 13.0);
  aurora = smoothstep(-0.2, 1.0, aurora);

  vec3 deep = vec3(0.015, 0.018, 0.035);
  vec3 glow = mix(u_accentColor, u_secondaryColor, uv.x + sin(u_time * 0.12) * 0.18);
  float vignette = smoothstep(0.92, 0.18, radius);
  float beam = smoothstep(0.65, 0.02, abs(centered.y + sin(centered.x * 3.0 + u_time * 0.2) * 0.16));
  vec3 color = deep + glow * aurora * beam * u_intensity * 0.9;
  color += glow * pow(vignette, 2.0) * 0.18 * u_intensity;

  gl_FragColor = vec4(color, max(0.0, vignette));
}
`;
const sceneDefinitionCache = new Map();

function readFlag(params, name) {
  const value = params.get(name);
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function safeUrl(value, fallback, allowedProtocols) {
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    return allowedProtocols.includes(parsed.protocol) ? value : fallback;
  } catch {
    return fallback;
  }
}

function safeRelativePath(value, fallback) {
  if (!value) return fallback;
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("://")) return fallback;
  if (normalized.split("/").some((part) => part === ".." || part === "")) return fallback;
  return /^[a-z0-9_./-]+$/i.test(normalized) ? normalized : fallback;
}

function normalizeInstance(value) {
  const normalized = (value || "main").trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(normalized) ? normalized : "main";
}

function hexToVec3(hex, fallback) {
  if (typeof hex !== "string") return fallback;
  const match = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return fallback;
  const normalized =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((char) => char + char)
          .join("")
      : match[1];
  const value = Number.parseInt(normalized, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
  }
  return shader;
}

function createProgram(gl, fragmentSource = fragmentShaderSource) {
  const program = gl.createProgram();
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Shader linking failed");
  }
  return program;
}

function sanitizeSceneKey(value) {
  const normalized = String(value || "idle")
    .trim()
    .toLowerCase();
  return /^[a-z0-9_-]{1,64}$/.test(normalized) ? normalized : "idle";
}

async function readText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.text();
}

async function loadSceneDefinition(sceneKey, assetBase, logger) {
  const key = sanitizeSceneKey(sceneKey);
  if (key === "idle") return null;
  if (sceneDefinitionCache.has(key)) return sceneDefinitionCache.get(key);

  const definitionPromise = (async () => {
    const basePath = `${assetBase.replace(/\/$/, "")}/${key}`;
    const manifestResponse = await fetch(`${basePath}/scene.json`);
    if (!manifestResponse.ok) throw new Error(`Scene manifest not found: ${key}`);
    const manifest = await manifestResponse.json();
    const fragmentShader = manifest.fragmentShader
      ? await readText(`${basePath}/${manifest.fragmentShader}`)
      : fragmentShaderSource;

    return {
      key,
      manifest,
      fragmentShader,
    };
  })().catch((error) => {
    sceneDefinitionCache.delete(key);
    logger.warn(`Falling back to built-in shader for scene "${key}".`, error);
    return {
      key,
      manifest: {
        defaults: {},
      },
      fragmentShader: fragmentShaderSource,
    };
  });

  sceneDefinitionCache.set(key, definitionPromise);
  return definitionPromise;
}

function createRenderer(canvas, logger) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
  });

  if (!gl) {
    logger.warn("WebGL unavailable for scene runtime.");
    return {
      setFragmentShader() {},
      setParameters() {},
      setActive() {},
      start() {},
    };
  }

  let program = createProgram(gl);
  const positionBuffer = gl.createBuffer();
  let activeFragmentSource = fragmentShaderSource;
  let locations = getLocations();

  let startedAt = performance.now();
  let animationFrameId = null;
  let isActive = false;
  let parameters = {
    accentColor: "#9146FF",
    secondaryColor: "#00D1FF",
    intensity: 0.8,
  };
  let parameterUniforms = {
    accent: hexToVec3(parameters.accentColor, [0.57, 0.27, 1]),
    secondary: hexToVec3(parameters.secondaryColor, [0, 0.82, 1]),
    intensity: Number(parameters.intensity ?? 0.8),
  };

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  function getLocations() {
    return {
      position: gl.getAttribLocation(program, "a_position"),
      resolution: gl.getUniformLocation(program, "u_resolution"),
      time: gl.getUniformLocation(program, "u_time"),
      accentColor: gl.getUniformLocation(program, "u_accentColor"),
      secondaryColor: gl.getUniformLocation(program, "u_secondaryColor"),
      intensity: gl.getUniformLocation(program, "u_intensity"),
    };
  }

  function resize() {
    const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }
  resize();

  function render() {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(locations.resolution, canvas.width, canvas.height);
    gl.uniform1f(locations.time, (performance.now() - startedAt) / 1000);
    gl.uniform3fv(locations.accentColor, parameterUniforms.accent);
    gl.uniform3fv(locations.secondaryColor, parameterUniforms.secondary);
    gl.uniform1f(locations.intensity, parameterUniforms.intensity);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (isActive) {
      animationFrameId = requestAnimationFrame(render);
    }
  }

  return {
    setFragmentShader(nextFragmentSource) {
      if (!nextFragmentSource || nextFragmentSource === activeFragmentSource) return;
      try {
        const nextProgram = createProgram(gl, nextFragmentSource);
        gl.deleteProgram(program);
        program = nextProgram;
        locations = getLocations();
        activeFragmentSource = nextFragmentSource;
        startedAt = performance.now();
      } catch (error) {
        logger.warn("Scene shader compilation failed; keeping previous shader.", error);
      }
    },
    setParameters(nextParameters = {}) {
      parameters = { ...parameters, ...nextParameters };
      parameterUniforms = {
        accent: hexToVec3(parameters.accentColor, [0.57, 0.27, 1]),
        secondary: hexToVec3(parameters.secondaryColor, [0, 0.82, 1]),
        intensity: Number(parameters.intensity ?? 0.8),
      };
    },
    setActive(nextActive) {
      if (nextActive === isActive) return;
      isActive = nextActive;

      if (isActive) {
        startedAt = performance.now();
        animationFrameId = requestAnimationFrame(render);
      } else if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    },
    start() {
      if (isActive) requestAnimationFrame(render);
    },
  };
}

function createSceneController(dom, renderer, instance, assetBase, logger) {
  let currentScene = { ...IDLE_SCENE };
  let countdownTimer = null;
  let sceneQueue = Promise.resolve();

  function updateCountdown() {
    if (!currentScene.countdownEndsAt) {
      dom.countdown.textContent = "";
      return;
    }

    const remainingMs = new Date(currentScene.countdownEndsAt).getTime() - Date.now();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      dom.countdown.textContent = "00:00";
      return;
    }

    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    dom.countdown.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  async function setScene(nextScene) {
    const sceneKey = sanitizeSceneKey(nextScene.sceneKey || currentScene.sceneKey);
    const definition = await loadSceneDefinition(sceneKey, assetBase, logger);
    const definitionDefaults = definition?.manifest?.defaults || {};
    const baseScene =
      currentScene.sceneKey === sceneKey
        ? currentScene
        : {
            ...IDLE_SCENE,
            ...definitionDefaults,
            sceneKey,
          };

    currentScene = {
      ...baseScene,
      ...nextScene,
      sceneKey,
      parameters: {
        ...(definitionDefaults.parameters || {}),
        ...(baseScene.parameters || {}),
        ...(nextScene.parameters || {}),
      },
    };

    if (definition?.fragmentShader) renderer.setFragmentShader(definition.fragmentShader);
    const isIdle = currentScene.sceneKey === "idle";
    dom.content.classList.toggle("scene-idle", isIdle);
    dom.canvas.classList.toggle("scene-idle", isIdle);
    renderer.setActive(!isIdle);
    dom.kicker.textContent = currentScene.kicker || currentScene.sceneKey || "";
    dom.title.textContent = currentScene.title || "";
    dom.subtitle.textContent = currentScene.subtitle || "";
    dom.status.textContent = `Scene: ${instance}/${currentScene.sceneKey}`;
    document.documentElement.style.setProperty(
      "--scene-accent",
      currentScene.parameters.accentColor || "#9146FF",
    );
    renderer.setParameters(currentScene.parameters);

    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    updateCountdown();
    if (currentScene.countdownEndsAt) {
      countdownTimer = setInterval(updateCountdown, 500);
    }
  }

  function enqueueSceneUpdate(nextScene) {
    sceneQueue = sceneQueue
      .then(() => setScene(nextScene))
      .catch((error) => {
        logger.warn("Scene update failed.", error);
      });
    return sceneQueue;
  }

  function handleEvent(packet) {
    if (!packet || !String(packet.type || "").startsWith("scene.")) return;
    const targetInstance = packet?.target?.instance || "main";
    if (targetInstance !== instance) return;

    if (packet.type === "scene.end") {
      enqueueSceneUpdate({ ...IDLE_SCENE });
      return;
    }

    if (packet.type === "scene.begin" || packet.type === "scene.update") {
      enqueueSceneUpdate(packet.payload || {});
      logger.debug("scene event applied", packet);
    }
  }

  return {
    handleEvent,
    setScene: enqueueSceneUpdate,
  };
}

function connectSceneSocket({ wsUrl, logger, onPacket, statusEl }) {
  let reconnectAttempt = 0;

  function connect() {
    const socket = new WebSocket(wsUrl);
    statusEl.textContent = "Scene: connecting";

    socket.addEventListener("open", () => {
      reconnectAttempt = 0;
      statusEl.textContent = "Scene: connected";
      logger.info(`Connected to scene event socket at ${wsUrl}`);
    });

    socket.addEventListener("message", (event) => {
      try {
        onPacket(JSON.parse(event.data));
      } catch (error) {
        logger.warn("Ignoring invalid scene event payload", error);
      }
    });

    socket.addEventListener("close", () => {
      reconnectAttempt += 1;
      const delay = Math.min(12000, 750 * 2 ** Math.max(0, reconnectAttempt - 1));
      statusEl.textContent = `Scene: reconnecting (${reconnectAttempt})`;
      setTimeout(connect, delay);
    });
  }

  connect();
}

async function restoreSceneState({ apiUrl, instance, controller, logger }) {
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/scenes/${instance}/state`);
    if (!response.ok) return;
    const state = await response.json();
    if (state?.active) await controller.setScene(state.active);
  } catch (error) {
    logger.debug("Scene state restore skipped", error);
  }
}

const params = new URLSearchParams(window.location.search);
const debug = readFlag(params, "debug");
const instance = normalizeInstance(params.get("instance"));
const overlayWsUrl = safeUrl(params.get("overlayWsUrl"), DEFAULT_OVERLAY_WS_URL, ["ws:", "wss:"]);
const sceneApiUrl = safeUrl(params.get("sceneApiUrl"), DEFAULT_SCENE_API_URL, ["http:", "https:"]);
const sceneAssetBase = safeRelativePath(params.get("sceneAssetBase"), DEFAULT_SCENE_ASSET_BASE);
const logger = createLogger("scene-runtime", debug);

if (debug) document.body.classList.add("scene-debug");

const dom = {
  canvas: document.getElementById("sceneCanvas"),
  content: document.getElementById("sceneContent"),
  kicker: document.getElementById("sceneKicker"),
  title: document.getElementById("sceneTitle"),
  subtitle: document.getElementById("sceneSubtitle"),
  countdown: document.getElementById("sceneCountdown"),
  status: document.getElementById("sceneStatus"),
};

const renderer = createRenderer(dom.canvas, logger);
const controller = createSceneController(dom, renderer, instance, sceneAssetBase, logger);
renderer.start();
restoreSceneState({ apiUrl: sceneApiUrl, instance, controller, logger });

if (readFlag(params, "demo")) {
  void controller.setScene({
    sceneKey: "starting-soon",
    kicker: "Live shortly",
    title: "Starting Soon",
    subtitle: "Grab a drink and settle in.",
    countdownEndsAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    parameters: {
      accentColor: "#9146FF",
      secondaryColor: "#00D1FF",
      intensity: 0.9,
    },
  });
} else {
  connectSceneSocket({
    wsUrl: overlayWsUrl,
    logger,
    onPacket: controller.handleEvent,
    statusEl: dom.status,
  });
}
