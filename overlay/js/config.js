import { CHAT_DEFAULTS, DEFAULTS, WEBSOCKET_DEFAULTS } from "./constants.js";
import { readDebugFlagFromQuery } from "./logger.js";

function isValidWebSocketUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "ws:" || parsed.protocol === "wss:";
  } catch {
    return false;
  }
}

function pickWsUrlCandidate(candidates) {
  for (const candidate of candidates) {
    if (isValidWebSocketUrl(candidate)) return candidate;
  }
  return DEFAULTS.wsUrl;
}

export function getRuntimeConfig() {
  const params = new URLSearchParams(window.location.search);
  const debug = readDebugFlagFromQuery();
  const fromQuery = params.get("wsUrl") || params.get("streamerbotWsUrl");
  const fromWindow =
    window.__SAI_CHAT_OVERLAY_CONFIG__?.wsUrl || window.__SAI_OVERLAY_CONFIG__?.wsUrl;

  const wsUrl = pickWsUrlCandidate([fromQuery, fromWindow, DEFAULTS.wsUrl]);
  const maxMessages = Number.parseInt(params.get("maxMessages") || "", 10);

  return {
    debug,
    wsUrl,
    websocket: {
      wsUrl,
      reconnectInitialDelayMs: WEBSOCKET_DEFAULTS.reconnectInitialDelayMs,
      reconnectMaxDelayMs: WEBSOCKET_DEFAULTS.reconnectMaxDelayMs,
      reconnectBackoff: WEBSOCKET_DEFAULTS.reconnectBackoff,
      reconnectJitterRatio: WEBSOCKET_DEFAULTS.reconnectJitterRatio,
      connectTimeoutMs: WEBSOCKET_DEFAULTS.connectTimeoutMs,
    },
    chat: {
      maxMessages:
        Number.isFinite(maxMessages) && maxMessages >= 1 && maxMessages <= 50
          ? maxMessages
          : CHAT_DEFAULTS.maxMessages,
      burstPerFrame: CHAT_DEFAULTS.burstPerFrame,
    },
  };
}
