import { afterEach, describe, expect, it } from "vitest";
import { getRuntimeConfig } from "../overlay/js/config.js";

const originalWindow = global.window;

function mockWindow(search) {
  global.window = {
    location: { search },
    __SAI_CHAT_OVERLAY_CONFIG__: undefined,
    __SAI_OVERLAY_CONFIG__: undefined,
  };
}

afterEach(() => {
  global.window = originalWindow;
});

describe("getRuntimeConfig", () => {
  it("reads wsUrl and debug from query params", () => {
    mockWindow("?wsUrl=ws://127.0.0.1:9000&debug=true&maxMessages=12");
    const cfg = getRuntimeConfig();

    expect(cfg.debug).toBe(true);
    expect(cfg.eventSource).toBe("streamerbot");
    expect(cfg.wsUrl).toBe("ws://127.0.0.1:9000");
    expect(cfg.websocket.wsUrl).toBe("ws://127.0.0.1:9000");
    expect(cfg.chat.maxMessages).toBe(12);
  });

  it("falls back to defaults for invalid wsUrl and maxMessages", () => {
    mockWindow("?wsUrl=javascript:alert(1)&maxMessages=999");
    const cfg = getRuntimeConfig();

    expect(cfg.wsUrl).toBe("ws://localhost:8080");
    expect(cfg.chat.maxMessages).toBe(10);
  });

  it("reads moderation event source, overlay websocket url, and demo mode", () => {
    mockWindow("?eventSource=moderation&overlayWsUrl=ws://127.0.0.1:8787/ws?channel=overlay&demo=true");
    const cfg = getRuntimeConfig();

    expect(cfg.eventSource).toBe("moderation");
    expect(cfg.demo).toBe(true);
    expect(cfg.overlayWsUrl).toBe("ws://127.0.0.1:8787/ws?channel=overlay");
    expect(cfg.websocket.wsUrl).toBe("ws://127.0.0.1:8787/ws?channel=overlay");
  });

  it("falls back to streamerbot mode for unknown event source values", () => {
    mockWindow("?eventSource=unknown&overlayWsUrl=javascript:alert(1)");
    const cfg = getRuntimeConfig();

    expect(cfg.eventSource).toBe("streamerbot");
    expect(cfg.overlayWsUrl).toBe("ws://localhost:8787/ws?channel=overlay");
  });
});
