import { CHAT_DEFAULTS, GAP_PX } from "./constants.js";
import { animateRemoveMessage } from "./animations.js";
import { getCssNumberVar } from "./utils.js";
import { createEmoteCache } from "./emote-cache.js";

function appendMessageContent(div, message, segments) {
  const textSegments = Array.isArray(segments)
    ? segments
    : [{ type: "text", text: String(message) }];

  textSegments.forEach((segment) => {
    if (segment?.type === "emote" && typeof segment.url === "string" && segment.url) {
      const emote = document.createElement("img");
      emote.src = segment.url;
      emote.alt = segment.alt || "emote";
      emote.className = "emote";
      emote.loading = "eager";
      div.appendChild(emote);
      return;
    }

    const text = typeof segment?.text === "string" ? segment.text : "";
    if (text) div.appendChild(document.createTextNode(text));
  });
}

function buildMessageNode(user, message, platform, badges, segments) {
  const div = document.createElement("div");
  div.className = `msg ${platform.toLowerCase()}`;

  if (Array.isArray(badges)) {
    badges.forEach((url) => {
      const badge = document.createElement("img");
      badge.src = url;
      badge.alt = "badge";
      badge.className = "badge";
      div.appendChild(badge);
    });
  }

  const userSpan = document.createElement("span");
  userSpan.className = "user";
  userSpan.textContent = `${user}:`;
  div.appendChild(userSpan);
  div.appendChild(document.createTextNode(" "));
  appendMessageContent(div, message, segments);
  return div;
}

function getEnterDurationMs() {
  return getCssNumberVar("--msg-enter-ms", 300);
}

export function createChatController(chat, getFadeTimeMs, options = {}) {
  const maxMessages = options.maxMessages || CHAT_DEFAULTS.maxMessages;
  const burstPerFrame = options.burstPerFrame || CHAT_DEFAULTS.burstPerFrame;
  const emoteCache = createEmoteCache(
    options.maxCachedEmotes || CHAT_DEFAULTS.maxCachedEmotes || 256,
  );

  let isCompacting = false;
  let flushScheduled = false;
  const pendingMessages = [];

  function compactOverflow() {
    if (isCompacting) return;
    if (chat.children.length <= maxMessages) return;

    isCompacting = true;
    const first = chat.firstElementChild;
    if (!first) {
      isCompacting = false;
      return;
    }

    animateRemoveMessage(chat, first, GAP_PX, () => {
      isCompacting = false;
      if (chat.children.length > maxMessages) compactOverflow();
    });
  }

  function renderMessage(user, message, platform, badges, segments) {
    const div = buildMessageNode(user, message, platform, badges, segments);
    div.style.transition = `transform ${getEnterDurationMs()}ms ease`;
    div.style.transform = "translate3d(100%, 0, 0)";
    div.style.opacity = "1";
    chat.appendChild(div);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        div.style.transform = "translate3d(0, 0, 0)";
      });
    });

    setTimeout(() => {
      if (div.parentNode) animateRemoveMessage(chat, div, GAP_PX);
    }, getFadeTimeMs());

    compactOverflow();
  }

  function flushPending() {
    flushScheduled = false;
    let processed = 0;

    while (pendingMessages.length > 0 && processed < burstPerFrame) {
      const entry = pendingMessages.shift();
      renderMessage(entry.user, entry.message, entry.platform, entry.badges, entry.segments);
      processed += 1;
    }

    if (pendingMessages.length > 0) scheduleFlush();
  }

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    requestAnimationFrame(flushPending);
  }

  function addMessage(user, message, platform, badges, segments) {
    if (Array.isArray(segments)) {
      segments.forEach((segment) => {
        if (segment?.type === "emote" && typeof segment.url === "string") {
          emoteCache.prefetch(segment.url);
        }
      });
    }

    pendingMessages.push({ user, message, platform, badges, segments });
    scheduleFlush();
  }

  return {
    addMessage,
  };
}
