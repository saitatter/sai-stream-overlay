import { createLogger } from "./logger.js";

const DEFAULT_OVERLAY_WS_URL = "ws://localhost:8787/ws?channel=overlay";
const ALERT_VISIBLE_MS = 7000;

function safeUrl(value, fallback, protocols) {
  if (!value) return fallback;
  try {
    const parsed = new URL(value, window.location.href);
    return protocols.includes(parsed.protocol) ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}

function readBooleanFlag(params, name) {
  if (!params.has(name)) return false;
  const value = params.get(name);
  if (value === "") return true;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readActorName(actor = {}) {
  return actor.displayName || actor.name || actor.username || "Someone";
}

function formatDonation(payload = {}) {
  const amount = Number(payload.amount);
  const currency = typeof payload.currency === "string" ? payload.currency : "USD";
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function normalizeAlertEvent(packet) {
  if (!packet || typeof packet !== "object") return null;
  if (packet.type === "donation.received") {
    const payload = packet.payload && typeof packet.payload === "object" ? packet.payload : {};
    const actor = packet.actor && typeof packet.actor === "object" ? packet.actor : {};
    return {
      id: packet.id || `donation-${Date.now()}`,
      type: "donation.received",
      kicker: "Donation",
      title: readActorName(actor),
      message: payload.message || "Thank you for the support!",
      meta: formatDonation(payload),
      accentColor: payload.accentColor || "#00d1ff",
    };
  }

  if (packet.type === "alert.begin" || packet.type === "alert.update") {
    const payload = packet.payload && typeof packet.payload === "object" ? packet.payload : {};
    return {
      id: packet.id || `alert-${Date.now()}`,
      type: packet.type,
      kicker: payload.kicker || payload.category || "Alert",
      title: payload.title || readActorName(packet.actor),
      message: payload.message || "",
      meta: payload.meta || "",
      accentColor: payload.accentColor || "#9146ff",
    };
  }

  if (packet.type === "alert.end") {
    return {
      id: packet.id || `alert-end-${Date.now()}`,
      type: "alert.end",
      kicker: "",
      title: "",
      message: "",
      meta: "",
      accentColor: "#00d1ff",
    };
  }

  return null;
}

export function createAlertController(dom, logger) {
  let hideTimer;

  function hide() {
    dom.root.classList.add("alert-idle");
    dom.status.textContent = "Alert: idle";
  }

  function show(alert) {
    if (hideTimer) clearTimeout(hideTimer);
    if (alert.type === "alert.end") {
      hide();
      return;
    }
    dom.root.style.setProperty("--alert-accent", alert.accentColor);
    dom.kicker.textContent = alert.kicker;
    dom.title.textContent = alert.title;
    dom.message.textContent = alert.message;
    dom.meta.textContent = alert.meta;
    dom.root.classList.remove("alert-idle");
    dom.status.textContent = `Alert: ${alert.type}`;
    hideTimer = setTimeout(hide, ALERT_VISIBLE_MS);
    logger.debug("alert applied", alert);
  }

  return {
    handlePacket(packet) {
      const alert = normalizeAlertEvent(packet);
      if (!alert) return false;
      show(alert);
      return true;
    },
    show,
    hide,
  };
}

function connect({ wsUrl, controller, logger }) {
  const socket = new WebSocket(wsUrl);
  socket.addEventListener("open", () => logger.info(`Connected to alert socket at ${wsUrl}`));
  socket.addEventListener("message", (event) => {
    try {
      controller.handlePacket(JSON.parse(String(event.data)));
    } catch (error) {
      logger.warn("Ignoring invalid alert event payload", error);
    }
  });
  socket.addEventListener("close", () => {
    setTimeout(() => connect({ wsUrl, controller, logger }), 1200);
  });
}

export function initAlertRuntime() {
  const params = new URLSearchParams(window.location.search);
  const debug = readBooleanFlag(params, "debug");
  const demo = readBooleanFlag(params, "demo");
  const logger = createLogger("alert-runtime", debug);
  const overlayWsUrl = safeUrl(params.get("overlayWsUrl"), DEFAULT_OVERLAY_WS_URL, ["ws:", "wss:"]);
  if (debug) document.body.classList.add("alert-debug");

  const controller = createAlertController(
    {
      root: document.getElementById("alertRoot"),
      kicker: document.getElementById("alertKicker"),
      title: document.getElementById("alertTitle"),
      message: document.getElementById("alertMessage"),
      meta: document.getElementById("alertMeta"),
      status: document.getElementById("alertStatus"),
    },
    logger,
  );

  if (demo) {
    controller.handlePacket({
      id: "demo-donation",
      type: "donation.received",
      actor: { displayName: "ViewerName" },
      payload: { amount: 25, currency: "USD", message: "For the shader fund!" },
    });
    return controller;
  }

  connect({ wsUrl: overlayWsUrl, controller, logger });
  return controller;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initAlertRuntime();
}
