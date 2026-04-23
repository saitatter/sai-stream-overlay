/**
 * @typedef {Object} ParsedChatEvent
 * @property {string} user
 * @property {string} message
 * @property {"twitch"|"youtube"} platform
 * @property {string[]} badges
 */

function asDisplayString(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function getEmojiFromNode(node) {
  if (!node || typeof node !== "object") return "";

  if (typeof node.text === "string") return node.text;
  if (typeof node.alt === "string") return node.alt;
  if (typeof node.name === "string") return node.name;

  if (Array.isArray(node.shortcuts) && typeof node.shortcuts[0] === "string") {
    return node.shortcuts[0];
  }

  if (node.emoji) return getEmojiFromNode(node.emoji);
  return "";
}

function flattenMessageNode(value) {
  if (value == null) return "";

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => flattenMessageNode(entry)).join("");
  }

  if (typeof value !== "object") return "";

  const text = asDisplayString(value.text);
  if (text) return text;

  const alt = asDisplayString(value.alt);
  if (alt) return alt;

  if (Array.isArray(value.runs)) return flattenMessageNode(value.runs);
  if (Array.isArray(value.fragments)) return flattenMessageNode(value.fragments);
  if (Array.isArray(value.parts)) return flattenMessageNode(value.parts);
  if (Array.isArray(value.messageParts)) return flattenMessageNode(value.messageParts);

  if (value.emoji) return getEmojiFromNode(value.emoji);

  return "";
}

function getMessageText(value) {
  const flattened = flattenMessageNode(value);
  if (flattened) return flattened;
  return asDisplayString(value);
}

function getBadges(packet) {
  if (!Array.isArray(packet?.data?.user?.badges)) return [];
  return packet.data.user.badges
    .map((badge) => badge?.imageUrl)
    .filter((url) => typeof url === "string");
}

/**
 * @param {any} packet
 * @returns {ParsedChatEvent|null}
 */
function parseTwitchEvent(packet) {
  if (packet?.data?.user?.name == null || packet?.data?.message?.message == null) return null;

  return {
    user: asDisplayString(packet.data.user.name),
    message: getMessageText(packet.data.message.message),
    platform: "twitch",
    badges: getBadges(packet),
  };
}

/**
 * @param {any} packet
 * @returns {ParsedChatEvent|null}
 */
function parseYouTubeEvent(packet) {
  if (packet?.data?.user?.name == null || packet?.data?.message == null) return null;

  return {
    user: asDisplayString(packet.data.user.name),
    message: getMessageText(packet.data.message),
    platform: "youtube",
    badges: getBadges(packet),
  };
}

function getNormalizedBadges(packet) {
  const badges = packet?.actor?.badges;
  if (!Array.isArray(badges)) return [];
  return badges
    .map((badge) => {
      if (typeof badge === "string") return badge;
      return badge?.imageUrl;
    })
    .filter((url) => typeof url === "string");
}

function normalizePlatform(value) {
  const source = asDisplayString(value).trim().toLowerCase();
  if (source === "youtube") return "youtube";
  return "twitch";
}

/**
 * @param {any} packet
 * @returns {ParsedChatEvent|null}
 */
export function parseModerationChatEvent(packet) {
  if (packet?.type === "chat.message") {
    const user = packet?.actor?.displayName ?? packet?.actor?.name;
    const message = packet?.payload?.message;
    if (user == null || message == null) return null;

    return {
      user: asDisplayString(user),
      message: asDisplayString(message),
      platform: normalizePlatform(packet.source),
      badges: getNormalizedBadges(packet),
    };
  }

  if (packet?.eventType === "overlay.message") {
    if (packet?.username == null || packet?.text == null) return null;

    return {
      user: asDisplayString(packet.username),
      message: asDisplayString(packet.text),
      platform: normalizePlatform(packet.platform),
      badges: [],
    };
  }

  return null;
}

/**
 * @param {any} packet
 * @returns {ParsedChatEvent|null}
 */
export function parseChatEvent(packet) {
  const source = packet?.event?.source;
  if (source === "Twitch") return parseTwitchEvent(packet);
  if (source === "YouTube") return parseYouTubeEvent(packet);
  return null;
}
