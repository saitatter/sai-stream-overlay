/**
 * @typedef {Object} ParsedChatEvent
 * @property {string} user
 * @property {string} message
 * @property {"twitch"|"youtube"} platform
 * @property {string[]} badges
 */

function asDisplayString(value) {
  if (value == null) return "";
  return String(value);
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
    message: asDisplayString(packet.data.message.message),
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
    message: asDisplayString(packet.data.message),
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
