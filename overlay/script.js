import { createChatController } from "./js/chat.js";
import { getRuntimeConfig } from "./js/config.js";
import { getDom } from "./js/dom.js";
import { createLogger } from "./js/logger.js";
import { parseModerationChatEvent } from "./js/parsers.js";
import { setupSettings } from "./js/settings.js";
import { connectChatSocket } from "./js/websocket.js";

const dom = getDom();
const runtimeConfig = getRuntimeConfig();
const logger = createLogger("overlay", runtimeConfig.debug);
const settings = setupSettings(dom);
const chatController = createChatController(dom.chat, settings.getFadeTimeMs, runtimeConfig.chat);
let latestMetrics = null;

const demoPackets = [
  {
    type: "chat.message",
    source: "twitch",
    actor: {
      displayName: "DemoViewer",
      badges: [],
    },
    payload: {
      message: "Moderation pipeline test message",
    },
  },
  {
    eventType: "overlay.message",
    platform: "YouTube",
    username: "SaiDemo",
    text: "Legacy overlay.message compatibility",
  },
];

function renderSocketStatus({ status, detail, reconnectAttempt, wsUrl }) {
  if (!dom.wsStatus) return;

  dom.wsStatus.classList.remove(
    "ws-status-connected",
    "ws-status-connecting",
    "ws-status-reconnecting",
    "ws-status-disconnected",
  );

  const className = `ws-status-${status}`;
  dom.wsStatus.classList.add(className);

  if (status === "reconnecting") {
    dom.wsStatus.textContent = `WS: reconnecting (attempt ${reconnectAttempt})`;
    dom.wsStatus.title = `${detail} - ${wsUrl}`;
    return;
  }

  dom.wsStatus.textContent = `WS: ${status}`;
  let title = detail ? `${detail} - ${wsUrl}` : wsUrl;
  if (runtimeConfig.debug && latestMetrics) {
    title += ` | rx=${latestMetrics.messagesReceived} drop=${latestMetrics.messagesDropped} parseErr=${latestMetrics.parseErrors} reconnect=${latestMetrics.reconnectsScheduled}`;
  }
  dom.wsStatus.title = title;
}

if (runtimeConfig.demo) {
  let demoIndex = 0;
  renderSocketStatus({
    status: "connected",
    detail: "Demo mode is emitting moderation events",
    reconnectAttempt: 0,
    wsUrl: "demo://moderation",
  });

  setInterval(() => {
    const parsed = parseModerationChatEvent(demoPackets[demoIndex % demoPackets.length]);
    demoIndex += 1;
    if (parsed)
      chatController.addMessage(parsed.user, parsed.message, parsed.platform, parsed.badges);
  }, 1800);
} else {
  connectChatSocket(chatController.addMessage, {
    ...runtimeConfig.websocket,
    onStatusChange: renderSocketStatus,
    onMetricsChange: (metrics) => {
      latestMetrics = metrics;
      logger.debug("socket metrics", metrics);
    },
    logger,
  });
}
