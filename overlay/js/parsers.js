/**
 * @typedef {Object} MessageTextSegment
 * @property {"text"} type
 * @property {string} text
 */

/**
 * @typedef {Object} MessageEmoteSegment
 * @property {"emote"} type
 * @property {string} url
 * @property {string} alt
 */

/**
 * @typedef {MessageTextSegment|MessageEmoteSegment} MessageSegment
 */

/**
 * @typedef {Object} ParsedChatEvent
 * @property {string} user
 * @property {string} message
 * @property {"twitch"|"youtube"} platform
 * @property {string[]} badges
 * @property {MessageSegment[]} segments
 */

function asDisplayString(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function asImageUrl(value) {
  const url = asDisplayString(value).trim();
  if (!url) return "";

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch {
    return "";
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

function getImageUrlFromNode(node) {
  if (!node || typeof node !== "object") return "";

  const direct =
    asDisplayString(node.imageUrl) || asDisplayString(node.url) || asDisplayString(node.src);
  const safeDirect = asImageUrl(direct);
  if (safeDirect) return safeDirect;

  if (node.image && typeof node.image === "object") {
    const fromImage =
      asDisplayString(node.image.url) ||
      asDisplayString(node.image.src) ||
      asDisplayString(node.image.imageUrl);
    const safeImageUrl = asImageUrl(fromImage);
    if (safeImageUrl) return safeImageUrl;
  }

  const variants = Array.isArray(node.images)
    ? node.images
    : Array.isArray(node.imageUrls)
      ? node.imageUrls
      : null;
  if (variants) {
    for (const variant of variants) {
      const candidate =
        asDisplayString(variant?.url) ||
        asDisplayString(variant?.src) ||
        asDisplayString(variant?.imageUrl) ||
        (typeof variant === "string" ? variant : "");
      const safeCandidate = asImageUrl(candidate);
      if (safeCandidate) return safeCandidate;
    }
  }

  return "";
}

function pushTextSegment(segments, text) {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last && last.type === "text") {
    last.text += text;
    return;
  }
  segments.push({ type: "text", text });
}

function pushEmoteSegment(segments, url, alt) {
  if (!url) return false;
  segments.push({
    type: "emote",
    url,
    alt: alt || "emote",
  });
  return true;
}

function tryPushEmoteFromNode(segments, value) {
  if (!value || typeof value !== "object") return false;
  const target = value.emote || value.emoji || value.sticker || value;
  const alt =
    asDisplayString(target.alt) ||
    asDisplayString(target.name) ||
    getEmojiFromNode(target) ||
    getEmojiFromNode(value);
  const url = getImageUrlFromNode(target) || getImageUrlFromNode(value);
  return pushEmoteSegment(segments, url, alt);
}

function getIndexNumber(value, keys) {
  for (const key of keys) {
    if (typeof value?.[key] === "number" && Number.isFinite(value[key])) return value[key];
  }
  return null;
}

function appendTextWithEmoteRanges(segments, text, emotes) {
  if (!Array.isArray(emotes) || !text) {
    pushTextSegment(segments, text);
    return;
  }

  const ranges = emotes
    .map((emote) => {
      const start = getIndexNumber(emote, ["startIndex", "start", "from", "position"]);
      const length = getIndexNumber(emote, ["length"]);
      const rawEnd = getIndexNumber(emote, ["endIndex", "end", "to"]);
      if (start == null || start < 0) return null;

      let endExclusive = null;
      if (length != null && length > 0) endExclusive = start + length;
      else if (rawEnd != null) {
        // Twitch style ranges are commonly inclusive (start-end).
        endExclusive = rawEnd >= start ? rawEnd + 1 : null;
      }
      if (endExclusive == null || endExclusive <= start) return null;

      const url = getImageUrlFromNode(emote);
      if (!url) return null;

      const alt =
        asDisplayString(emote.name) ||
        asDisplayString(emote.code) ||
        asDisplayString(emote.text) ||
        text.slice(start, endExclusive);
      return { start, endExclusive, url, alt };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  if (ranges.length === 0) {
    pushTextSegment(segments, text);
    return;
  }

  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;

    if (range.start > cursor) {
      pushTextSegment(segments, text.slice(cursor, range.start));
    }

    pushEmoteSegment(segments, range.url, range.alt);
    cursor = range.endExclusive;
  }
  if (cursor < text.length) {
    pushTextSegment(segments, text.slice(cursor));
  }
}

function appendSegments(segments, value) {
  if (value == null) return;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    pushTextSegment(segments, String(value));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => appendSegments(segments, entry));
    return;
  }

  if (typeof value !== "object") return;

  if (Array.isArray(value.runs)) {
    appendSegments(segments, value.runs);
    return;
  }
  if (Array.isArray(value.fragments)) {
    appendSegments(segments, value.fragments);
    return;
  }
  if (Array.isArray(value.parts)) {
    appendSegments(segments, value.parts);
    return;
  }
  if (Array.isArray(value.messageParts)) {
    appendSegments(segments, value.messageParts);
    return;
  }

  if (Array.isArray(value.emotes) && typeof value.text === "string") {
    appendTextWithEmoteRanges(segments, value.text, value.emotes);
    return;
  }

  if (tryPushEmoteFromNode(segments, value)) return;

  const text =
    asDisplayString(value.text) ||
    asDisplayString(value.alt) ||
    getEmojiFromNode(value.emote || value.emoji || value.sticker || value);
  if (text) pushTextSegment(segments, text);
}

function getMessageSegments(value) {
  /** @type {MessageSegment[]} */
  const segments = [];
  appendSegments(segments, value);
  if (segments.length === 0) {
    pushTextSegment(segments, asDisplayString(value));
  }
  return segments;
}

function getMessageText(segments) {
  return segments
    .map((segment) => (segment.type === "text" ? segment.text : segment.alt || ""))
    .join("");
}

function getBadges(packet) {
  if (!Array.isArray(packet?.data?.user?.badges)) return [];
  return packet.data.user.badges.map((badge) => asImageUrl(badge?.imageUrl)).filter(Boolean);
}

/**
 * @param {any} packet
 * @returns {ParsedChatEvent|null}
 */
function parseTwitchEvent(packet) {
  if (packet?.data?.user?.name == null || packet?.data?.message?.message == null) return null;
  const segments = getMessageSegments(packet.data.message.message);

  return {
    user: asDisplayString(packet.data.user.name),
    message: getMessageText(segments),
    platform: "twitch",
    badges: getBadges(packet),
    segments,
  };
}

/**
 * @param {any} packet
 * @returns {ParsedChatEvent|null}
 */
function parseYouTubeEvent(packet) {
  if (packet?.data?.user?.name == null || packet?.data?.message == null) return null;
  const segments = getMessageSegments(packet.data.message);

  return {
    user: asDisplayString(packet.data.user.name),
    message: getMessageText(segments),
    platform: "youtube",
    badges: getBadges(packet),
    segments,
  };
}

function getNormalizedBadges(packet) {
  const badges = packet?.actor?.badges;
  if (!Array.isArray(badges)) return [];
  return badges
    .map((badge) => {
      if (typeof badge === "string") return asImageUrl(badge);
      return asImageUrl(badge?.imageUrl);
    })
    .filter(Boolean);
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
    const segments = getMessageSegments(packet?.payload?.segments || message);

    return {
      user: asDisplayString(user),
      message: getMessageText(segments),
      platform: normalizePlatform(packet.source),
      badges: getNormalizedBadges(packet),
      segments,
    };
  }

  if (packet?.eventType === "overlay.message") {
    if (packet?.username == null || packet?.text == null) return null;
    const segments = getMessageSegments(packet.segments || packet.text);

    return {
      user: asDisplayString(packet.username),
      message: getMessageText(segments),
      platform: normalizePlatform(packet.platform),
      badges: [],
      segments,
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
