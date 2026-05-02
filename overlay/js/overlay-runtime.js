import { createLogger } from "./logger.js";

const DEFAULT_OVERLAY_WS_URL = "ws://localhost:8787/ws?channel=overlay";
const DEFAULT_INSTANCE = "main";
const runtimeId =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const SAFE_COLOR_PATTERN = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
const SAFE_FONT_PATTERN = /^[a-z0-9 ,.'"_-]{1,80}$/i;

function readFlag(params, name) {
  const value = params.get(name);
  if (value === "") return params.has(name);
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

function sendJson(socket, packet, logger) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(packet));
    return true;
  } catch (error) {
    logger.warn("Failed to send overlay runtime packet", error);
    return false;
  }
}

function normalizeInstance(value) {
  const normalized = String(value || DEFAULT_INSTANCE)
    .trim()
    .toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(normalized) ? normalized : DEFAULT_INSTANCE;
}

function normalizeNodeId(value, fallback) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase();
  return /^[a-z0-9_-]{1,80}$/.test(normalized) ? normalized : fallback;
}

function readNumber(value, fallback, minimum = 0, maximum = 10000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function safeColor(value, fallback = "transparent") {
  if (typeof value !== "string") return fallback;
  return SAFE_COLOR_PATTERN.test(value.trim()) ? value.trim() : fallback;
}

function safeFontFamily(value) {
  if (typeof value !== "string") return "Inter, Segoe UI, sans-serif";
  return SAFE_FONT_PATTERN.test(value.trim()) ? value.trim() : "Inter, Segoe UI, sans-serif";
}

function normalizeStyle(style = {}) {
  const input = style && typeof style === "object" ? style : {};
  return {
    fontFamily: safeFontFamily(input.fontFamily),
    fontSize: readNumber(input.fontSize, 32, 6, 240),
    color: safeColor(input.color, "#ffffff"),
    backgroundColor: safeColor(input.backgroundColor, "transparent"),
    opacity: readNumber(input.opacity, 1, 0, 1),
    borderRadius: readNumber(input.borderRadius, 0, 0, 240),
  };
}

function normalizeStylePatch(style = {}) {
  const input = style && typeof style === "object" ? style : {};
  const patch = {};
  if (input.fontFamily != null) patch.fontFamily = safeFontFamily(input.fontFamily);
  if (input.fontSize != null) patch.fontSize = readNumber(input.fontSize, 32, 6, 240);
  if (input.color != null) patch.color = safeColor(input.color, "#ffffff");
  if (input.backgroundColor != null) {
    patch.backgroundColor = safeColor(input.backgroundColor, "transparent");
  }
  if (input.opacity != null) patch.opacity = readNumber(input.opacity, 1, 0, 1);
  if (input.borderRadius != null) patch.borderRadius = readNumber(input.borderRadius, 0, 0, 240);
  return patch;
}

function normalizeNode(node = {}, index = 0) {
  if (!node || typeof node !== "object") return null;
  const type = ["label", "panel", "shader"].includes(node.type) ? node.type : "label";
  return {
    id: normalizeNodeId(node.id, `${type}-${index + 1}`),
    type,
    text: typeof node.text === "string" ? node.text : "",
    binding: typeof node.binding === "string" ? node.binding.trim() : "",
    x: readNumber(node.x, 0),
    y: readNumber(node.y, 0),
    width: readNumber(node.width, 240, 1),
    height: readNumber(node.height, 80, 1),
    style: normalizeStyle(node.style),
  };
}

function normalizeNodePatch(value = {}) {
  const patch = {};
  if (!value || typeof value !== "object") return patch;
  if (typeof value.type === "string" && ["label", "panel", "shader"].includes(value.type)) {
    patch.type = value.type;
  }
  if (typeof value.text === "string") patch.text = value.text;
  if (typeof value.binding === "string") patch.binding = value.binding.trim();
  if (value.x != null) patch.x = readNumber(value.x, 0);
  if (value.y != null) patch.y = readNumber(value.y, 0);
  if (value.width != null) patch.width = readNumber(value.width, 240, 1);
  if (value.height != null) patch.height = readNumber(value.height, 80, 1);
  if (value.style && typeof value.style === "object")
    patch.style = normalizeStylePatch(value.style);
  return patch;
}

export function normalizeOverlayResource(value = {}) {
  if (!value || typeof value !== "object") return null;
  const target = value.target && typeof value.target === "object" ? value.target : {};
  const size = value.size && typeof value.size === "object" ? value.size : {};
  const nodes = Array.isArray(value.nodes)
    ? value.nodes.map(normalizeNode).filter((node) => node !== null)
    : [];
  return {
    key: normalizeNodeId(value.key, "overlay"),
    name: typeof value.name === "string" ? value.name : "Overlay",
    target: {
      instance: normalizeInstance(target.instance),
    },
    size: {
      width: readNumber(size.width, 1920, 1, 10000),
      height: readNumber(size.height, 1080, 1, 10000),
    },
    nodes,
  };
}

export function normalizeOverlayResourceEvent(packet) {
  if (!packet || packet.type !== "overlay.resource.updated") return null;
  const resource = packet.payload?.resource || packet.resource || packet.payload;
  return normalizeOverlayResource(resource);
}

export function normalizeOverlayStatePatchEvent(packet) {
  if (!packet || packet.type !== "overlay.state.patch") return null;
  const payload = packet.payload && typeof packet.payload === "object" ? packet.payload : {};
  if (Array.isArray(payload.patches)) {
    const patches = payload.patches
      .map((patch) => normalizeStatePatchPayload(patch, packet.target))
      .filter((patch) => patch !== null);
    return patches.length ? patches : null;
  }
  return normalizeStatePatchPayload(payload, packet.target);
}

function normalizeStatePatchPayload(payload, target) {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.path !== "string" || !payload.path.trim()) return null;
  return {
    target: {
      instance: normalizeInstance(target?.instance || payload.target?.instance),
    },
    path: payload.path.trim(),
    value: payload.value == null ? "" : payload.value,
  };
}

export function normalizeOverlayStateSnapshotEvent(packet) {
  if (!packet || packet.type !== "overlay.state.snapshot") return null;
  const payload = packet.payload && typeof packet.payload === "object" ? packet.payload : {};
  return {
    target: {
      instance: normalizeInstance(packet.target?.instance || payload.target?.instance),
    },
    state: structuredCloneSafe(
      payload.state && typeof payload.state === "object" ? payload.state : {},
    ),
  };
}

export function normalizeOverlayNodePatchEvent(packet) {
  if (!packet || packet.type !== "overlay.node.patch") return null;
  const payload = packet.payload && typeof packet.payload === "object" ? packet.payload : {};
  if (typeof payload.nodeId !== "string" || !payload.nodeId.trim()) return null;
  const patch = payload.patch && typeof payload.patch === "object" ? payload.patch : {};
  return {
    target: {
      instance: normalizeInstance(packet.target?.instance || payload.target?.instance),
    },
    nodeId: normalizeNodeId(payload.nodeId, "node"),
    patch: normalizeNodePatch(patch),
  };
}

function structuredCloneSafe(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? {}));
  } catch {
    return {};
  }
}

function pathParts(path) {
  return String(path || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
}

function getByPath(source, path) {
  if (!source || typeof source !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
  return pathParts(path).reduce((value, part) => {
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, part)) {
      return value[part];
    }
    return undefined;
  }, source);
}

function setByPath(source, path, value) {
  const parts = pathParts(path);
  if (!parts.length) return;
  let cursor = source;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

function asText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function nodeText(node, state) {
  if (node.binding) return asText(getByPath(state, node.binding) ?? node.text ?? "");
  return node.text ?? "";
}

function applyNodeStyle(element, node, scale) {
  element.style.left = `${node.x * scale.x}px`;
  element.style.top = `${node.y * scale.y}px`;
  element.style.width = `${node.width * scale.x}px`;
  element.style.height = `${node.height * scale.y}px`;
  element.style.fontFamily = node.style.fontFamily;
  element.style.fontSize = `${node.style.fontSize * Math.min(scale.x, scale.y)}px`;
  element.style.color = node.style.color;
  element.style.backgroundColor = node.style.backgroundColor;
  element.style.opacity = String(node.style.opacity);
  element.style.borderRadius = `${node.style.borderRadius * Math.min(scale.x, scale.y)}px`;
}

export function createOverlayController({
  dom,
  instance = DEFAULT_INSTANCE,
  logger,
  reportStatus = () => {},
}) {
  let currentResource = null;
  let statusReporter = reportStatus;
  const state = {};

  function statusPayload(extra = {}) {
    return {
      runtimeId,
      instance,
      resourceKey: currentResource?.key || "",
      nodeCount: currentResource?.nodes?.length || 0,
      timestamp: new Date().toISOString(),
      ...extra,
    };
  }

  function report(lifecycle, extra = {}) {
    statusReporter({
      type: "overlay.runtime.status",
      target: { instance },
      payload: statusPayload({ lifecycle, ...extra }),
    });
  }

  function render() {
    dom.root.replaceChildren();
    if (!currentResource) {
      dom.root.classList.add("overlay-idle");
      dom.status.textContent = "Overlay: idle";
      report("idle");
      return;
    }

    const bounds = dom.root.getBoundingClientRect?.() || {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const scale = {
      x: Math.max(1, bounds.width) / currentResource.size.width,
      y: Math.max(1, bounds.height) / currentResource.size.height,
    };

    for (const node of currentResource.nodes) {
      const element = document.createElement("div");
      element.className = `overlay-node overlay-node-${node.type}`;
      element.dataset.nodeId = node.id;
      element.dataset.binding = node.binding || "";
      element.textContent = node.type === "panel" ? "" : nodeText(node, state);
      applyNodeStyle(element, node, scale);
      dom.root.appendChild(element);
    }

    dom.root.classList.toggle("overlay-idle", currentResource.nodes.length === 0);
    dom.status.textContent = `Overlay: ${currentResource.key}`;
    report("rendered");
    logger.debug("overlay resource rendered", currentResource);
  }

  function applyResource(resource) {
    if (!resource) return false;
    if (resource.target.instance !== instance) return false;
    currentResource = resource;
    render();
    return true;
  }

  function applyStatePatch(patch) {
    if (!patch) return false;
    if (Array.isArray(patch)) return patch.map(applyStatePatch).some(Boolean);
    if (patch.target.instance !== instance) return false;
    setByPath(state, patch.path, patch.value);
    for (const element of dom.root.querySelectorAll?.("[data-binding]") || []) {
      if (element.dataset.binding === patch.path) element.textContent = asText(patch.value);
    }
    dom.status.textContent = `Overlay state: ${patch.path}`;
    report("state-patch", { path: patch.path });
    logger.debug("overlay state patch applied", patch);
    return true;
  }

  function applyStateSnapshot(snapshot) {
    if (!snapshot) return false;
    if (snapshot.target.instance !== instance) return false;
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, structuredCloneSafe(snapshot.state));
    render();
    report("state-snapshot");
    logger.debug("overlay state snapshot applied", snapshot);
    return true;
  }

  function applyNodePatch(nodePatch) {
    if (!nodePatch || !currentResource) return false;
    if (nodePatch.target.instance !== instance) return false;
    const nodeIndex = currentResource.nodes.findIndex((node) => node.id === nodePatch.nodeId);
    if (nodeIndex < 0) return false;
    currentResource = {
      ...currentResource,
      nodes: currentResource.nodes.map((node, index) =>
        index === nodeIndex
          ? {
              ...node,
              ...nodePatch.patch,
              id: node.id,
              type: nodePatch.patch.type || node.type,
              style: { ...node.style, ...nodePatch.patch.style },
            }
          : node,
      ),
    };
    render();
    report("node-patch", { nodeId: nodePatch.nodeId });
    logger.debug("overlay node patch applied", nodePatch);
    return true;
  }

  function handleEvent(packet) {
    const resource = normalizeOverlayResourceEvent(packet);
    if (resource) return applyResource(resource);
    const snapshot = normalizeOverlayStateSnapshotEvent(packet);
    if (snapshot) return applyStateSnapshot(snapshot);
    const nodePatch = normalizeOverlayNodePatchEvent(packet);
    if (nodePatch) return applyNodePatch(nodePatch);
    return applyStatePatch(normalizeOverlayStatePatchEvent(packet));
  }

  return {
    applyResource,
    applyStateSnapshot,
    applyStatePatch,
    applyNodePatch,
    handleEvent,
    render,
    report,
    setStatusReporter(nextReporter) {
      statusReporter = typeof nextReporter === "function" ? nextReporter : () => {};
    },
  };
}

async function restoreResource({ resourceUrl, controller, logger }) {
  if (!resourceUrl) return false;
  try {
    const response = await fetch(resourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const packet = await response.json();
    const applied =
      controller.handleEvent(packet) || controller.applyResource(normalizeOverlayResource(packet));
    if (applied) logger.info(`Restored overlay resource from ${resourceUrl}`);
    return applied;
  } catch (error) {
    logger.warn("Failed to restore overlay resource", error);
    return false;
  }
}

function connect({ wsUrl, resourceUrl, instance, controller, logger }) {
  let reconnectAttempt = 0;
  let activeSocket = null;

  function reportStatus(packet) {
    sendJson(activeSocket, packet, logger);
  }

  controller.setStatusReporter?.(reportStatus);

  function open() {
    const socket = new WebSocket(wsUrl);
    activeSocket = socket;
    socket.addEventListener("open", () => {
      reconnectAttempt = 0;
      logger.info(`Connected to overlay resource socket at ${wsUrl}`);
      controller.report("connected");
      sendJson(
        socket,
        {
          type: "overlay.resource.request",
          target: { instance },
          payload: { instance },
        },
        logger,
      );
      void restoreResource({ resourceUrl, controller, logger });
    });
    socket.addEventListener("message", (event) => {
      try {
        const packet = JSON.parse(String(event.data));
        controller.handleEvent(packet);
      } catch (error) {
        logger.warn("Ignoring invalid overlay resource event payload", error);
      }
    });
    socket.addEventListener("close", () => {
      controller.report("disconnected");
      reconnectAttempt += 1;
      const delay = Math.min(12000, 750 * 2 ** reconnectAttempt);
      window.setTimeout(open, delay);
    });
    socket.addEventListener("error", (error) => {
      logger.warn("Overlay resource socket error", error);
    });
  }

  open();
}

function start() {
  const params = new URLSearchParams(window.location.search);
  const debug = readFlag(params, "debug");
  const demo = readFlag(params, "demo");
  const instance = normalizeInstance(params.get("instance"));
  const overlayWsUrl = safeUrl(params.get("overlayWsUrl"), DEFAULT_OVERLAY_WS_URL, ["ws:", "wss:"]);
  const resourceUrl = safeUrl(params.get("resourceUrl"), "", ["http:", "https:"]);
  const logger = createLogger("overlay-runtime", debug);
  if (debug) document.body.classList.add("overlay-debug");

  const controller = createOverlayController({
    instance,
    logger,
    dom: {
      root: document.getElementById("overlayRoot"),
      status: document.getElementById("overlayStatus"),
    },
  });

  connect({ wsUrl: overlayWsUrl, resourceUrl, instance, controller, logger });

  if (demo) {
    controller.applyResource(
      normalizeOverlayResource({
        key: "demo-overlay",
        name: "Demo Overlay",
        target: { instance },
        size: { width: 1920, height: 1080 },
        nodes: [
          {
            id: "demo-panel",
            type: "panel",
            x: 120,
            y: 760,
            width: 620,
            height: 150,
            style: { backgroundColor: "#111827", opacity: 0.74, borderRadius: 12 },
          },
          {
            id: "demo-label",
            type: "label",
            text: "Latest follower: ViewerName",
            x: 160,
            y: 800,
            width: 560,
            height: 82,
            style: { fontSize: 44, color: "#ffffff", backgroundColor: "#000000", opacity: 0 },
          },
        ],
      }),
    );
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  start();
}
