export const GOOGLE_FONTS = [
  "Poppins",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Oswald",
  "Raleway",
  "Merriweather",
  "Nunito",
  "Ubuntu",
];

export const DEFAULTS = {
  twitchColor: "#9146FF",
  youtubeColor: "#FF0000",
  fadeTime: "10",
  msgBgColor: "#000000",
  msgBgOpacity: "0.6",
  fontFamily: "Poppins",
  wsUrl: "ws://localhost:8080",
};

export const GAP_PX = 10;
export const ANIM_MS = 500;
export const MAX_MESSAGES = 10;

export const WEBSOCKET_DEFAULTS = {
  reconnectInitialDelayMs: 1000,
  reconnectMaxDelayMs: 15000,
  reconnectBackoff: 1.8,
  reconnectJitterRatio: 0.2,
  connectTimeoutMs: 8000,
};

export const CHAT_DEFAULTS = {
  maxMessages: MAX_MESSAGES,
  burstPerFrame: 3,
};
