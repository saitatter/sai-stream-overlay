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
