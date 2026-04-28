import { describe, expect, it } from "vitest";
import { parseChatEvent, parseModerationChatEvent } from "../overlay/js/parsers.js";

describe("parseChatEvent", () => {
  it("parses a twitch message", () => {
    const packet = {
      event: { source: "Twitch" },
      data: {
        user: { name: "Alice", badges: [{ imageUrl: "https://example.com/badge.png" }] },
        message: { message: "Hello chat" },
      },
    };

    expect(parseChatEvent(packet)).toEqual({
      user: "Alice",
      message: "Hello chat",
      platform: "twitch",
      badges: ["https://example.com/badge.png"],
    });
  });

  it("drops invalid payloads safely", () => {
    const packet = {
      event: { source: "YouTube" },
      data: { user: { name: "" }, message: null },
    };
    expect(parseChatEvent(packet)).toBeNull();
  });
});

describe("parseModerationChatEvent", () => {
  it("parses a normalized chat.message payload", () => {
    const packet = {
      type: "chat.message",
      source: "youtube",
      actor: {
        displayName: "Bob",
        badges: [{ imageUrl: "https://example.com/member.png" }],
      },
      payload: {
        message: "Hello from moderation",
      },
    };

    expect(parseModerationChatEvent(packet)).toEqual({
      user: "Bob",
      message: "Hello from moderation",
      platform: "youtube",
      badges: ["https://example.com/member.png"],
    });
  });

  it("parses a legacy overlay.message payload from moderation docker", () => {
    const packet = {
      eventType: "overlay.message",
      platform: "Twitch",
      username: "Carol",
      text: "Approved legacy event",
    };

    expect(parseModerationChatEvent(packet)).toEqual({
      user: "Carol",
      message: "Approved legacy event",
      platform: "twitch",
      badges: [],
    });
  });

  it("drops unsupported moderation payloads safely", () => {
    expect(parseModerationChatEvent({ type: "donation.received" })).toBeNull();
    expect(parseModerationChatEvent({ eventType: "overlay.message", username: "NoText" })).toBeNull();
  });
});
