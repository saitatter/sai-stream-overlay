import { DEFAULTS, WEBSOCKET_DEFAULTS } from "./constants.js";
import { parseChatEvent, parseModerationChatEvent } from "./parsers.js";

function subscribeToChatEvents(ws) {
  ws.send(
    JSON.stringify({
      request: "Subscribe",
      id: "twitch-youtube-chat-subscribe",
      events: {
        YouTube: ["Message"],
        Twitch: ["ChatMessage"],
      },
    }),
  );
}

export function computeBackoffDelay({
  reconnectInitialDelayMs,
  reconnectBackoff,
  reconnectMaxDelayMs,
  reconnectJitterRatio,
  reconnectAttempt,
  randomFn = Math.random,
}) {
  const baseDelay = Math.round(
    reconnectInitialDelayMs * reconnectBackoff ** Math.max(0, reconnectAttempt - 1),
  );
  const jitter = Math.round(baseDelay * reconnectJitterRatio * randomFn());
  return Math.min(reconnectMaxDelayMs, baseDelay + jitter);
}

export function connectChatSocket(onChatMessage, options = {}) {
  const wsUrl = options.wsUrl || DEFAULTS.wsUrl;
  const eventSource = options.eventSource === "moderation" ? "moderation" : DEFAULTS.eventSource;
  const reconnectInitialDelayMs =
    options.reconnectInitialDelayMs || WEBSOCKET_DEFAULTS.reconnectInitialDelayMs;
  const reconnectMaxDelayMs = options.reconnectMaxDelayMs || WEBSOCKET_DEFAULTS.reconnectMaxDelayMs;
  const reconnectBackoff = options.reconnectBackoff || WEBSOCKET_DEFAULTS.reconnectBackoff;
  const reconnectJitterRatio =
    options.reconnectJitterRatio || WEBSOCKET_DEFAULTS.reconnectJitterRatio;
  const connectTimeoutMs = options.connectTimeoutMs || WEBSOCKET_DEFAULTS.connectTimeoutMs;
  const onStatusChange =
    typeof options.onStatusChange === "function" ? options.onStatusChange : () => {};
  const onMetricsChange =
    typeof options.onMetricsChange === "function" ? options.onMetricsChange : () => {};
  const logger = options.logger || console;

  let ws = null;
  let reconnectTimer = null;
  let connectTimer = null;
  let reconnectAttempt = 0;
  let intentionallyClosed = false;
  const metrics = {
    messagesReceived: 0,
    messagesDropped: 0,
    parseErrors: 0,
    reconnectsScheduled: 0,
  };

  function emitMetrics() {
    onMetricsChange({ ...metrics });
  }

  function setStatus(status, detail = "") {
    onStatusChange({
      status,
      detail,
      reconnectAttempt,
      wsUrl,
      eventSource,
    });
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function clearConnectTimer() {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
  }

  function computeReconnectDelay() {
    return computeBackoffDelay({
      reconnectInitialDelayMs,
      reconnectBackoff,
      reconnectMaxDelayMs,
      reconnectJitterRatio,
      reconnectAttempt,
    });
  }

  function scheduleReconnect() {
    if (intentionallyClosed) return;
    clearReconnectTimer();

    reconnectAttempt += 1;
    metrics.reconnectsScheduled += 1;
    emitMetrics();
    const delay = computeReconnectDelay();

    setStatus("reconnecting", `Retrying in ${delay}ms`);
    logger.warn(
      `Streamer.bot disconnected. Reconnecting in ${delay}ms (attempt ${reconnectAttempt})...`,
    );
    reconnectTimer = setTimeout(connect, delay);
  }

  function connect() {
    setStatus("connecting", "Opening WebSocket...");
    clearReconnectTimer();
    clearConnectTimer();
    if (ws) {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        // Ignore close errors while replacing a stale socket instance.
      }
    }

    try {
      ws = new WebSocket(wsUrl);
    } catch (error) {
      setStatus("disconnected", "WebSocket creation failed");
      logger.error("WebSocket creation failed:", error);
      scheduleReconnect();
      return;
    }

    connectTimer = setTimeout(() => {
      if (!ws || ws.readyState !== WebSocket.CONNECTING) return;
      logger.warn(`WebSocket connect timeout after ${connectTimeoutMs}ms.`);
      ws.close();
    }, connectTimeoutMs);

    ws.onopen = () => {
      clearConnectTimer();
      reconnectAttempt = 0;
      if (eventSource === "moderation") {
        setStatus("connected", "Connected to moderation overlay channel");
        logger.info(`Connected to moderation overlay WebSocket at ${wsUrl}`);
        return;
      }

      setStatus("connected", "Subscribed to chat events");
      logger.info(`Connected to Streamer.bot WebSocket at ${wsUrl}`);
      subscribeToChatEvents(ws);
    };

    ws.onerror = (error) => {
      setStatus("disconnected", "WebSocket error");
      logger.error("Streamer.bot WebSocket error:", error);
    };

    ws.onmessage = (event) => {
      let packet;
      try {
        packet = JSON.parse(event.data);
      } catch (error) {
        metrics.parseErrors += 1;
        emitMetrics();
        logger.error("Invalid WebSocket payload:", error);
        return;
      }

      metrics.messagesReceived += 1;
      const parsed =
        eventSource === "moderation" ? parseModerationChatEvent(packet) : parseChatEvent(packet);
      if (!parsed) {
        metrics.messagesDropped += 1;
        emitMetrics();
        return;
      }
      onChatMessage(parsed.user, parsed.message, parsed.platform, parsed.badges);
      emitMetrics();
    };

    ws.onclose = () => {
      clearConnectTimer();
      if (intentionallyClosed) return;
      setStatus("disconnected", "Socket closed");
      scheduleReconnect();
    };
  }

  function close() {
    intentionallyClosed = true;
    clearReconnectTimer();
    clearConnectTimer();
    setStatus("disconnected", "Closed by client");
    if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, "Client closed");
    if (ws && ws.readyState === WebSocket.CONNECTING) ws.close();
  }

  connect();

  return {
    close,
    getUrl: () => wsUrl,
    getMetrics: () => ({ ...metrics }),
  };
}
