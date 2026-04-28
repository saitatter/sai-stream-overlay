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
      segments: [{ type: "text", text: "Hello chat" }],
    });
  });

  it("drops invalid payloads safely", () => {
    const packet = {
      event: { source: "YouTube" },
      data: { user: { name: "" }, message: null },
    };
    expect(parseChatEvent(packet)).toBeNull();
  });

  it("parses youtube structured runs with emoji", () => {
    const packet = {
      event: { source: "YouTube" },
      data: {
        user: { name: "Bob" },
        message: {
          runs: [{ text: "Salut " }, { emoji: { shortcuts: ["😀"] } }, { text: " chat" }],
        },
      },
    };

    expect(parseChatEvent(packet)).toEqual({
      user: "Bob",
      message: "Salut 😀 chat",
      platform: "youtube",
      badges: [],
      segments: [{ type: "text", text: "Salut 😀 chat" }],
    });
  });

  it("parses twitch structured fragments with custom emote image", () => {
    const packet = {
      event: { source: "Twitch" },
      data: {
        user: { name: "Alice" },
        message: {
          message: {
            fragments: [
              { text: "GG " },
              {
                emote: {
                  name: "FireHype",
                  imageUrl: "https://cdn.example.com/emotes/firehype.png",
                },
              },
            ],
          },
        },
      },
    };

    expect(parseChatEvent(packet)).toEqual({
      user: "Alice",
      message: "GG FireHype",
      platform: "twitch",
      badges: [],
      segments: [
        { type: "text", text: "GG " },
        {
          type: "emote",
          url: "https://cdn.example.com/emotes/firehype.png",
          alt: "FireHype",
        },
      ],
    });
  });

  it("parses emotes array with inline ranges", () => {
    const packet = {
      event: { source: "Twitch" },
      data: {
        user: { name: "Zed" },
        message: {
          message: {
            text: "Hi Kappa",
            emotes: [
              {
                name: "Kappa",
                startIndex: 3,
                endIndex: 7,
                imageUrl: "https://cdn.example.com/emotes/kappa.png",
              },
            ],
          },
        },
      },
    };

    expect(parseChatEvent(packet)).toEqual({
      user: "Zed",
      message: "Hi Kappa",
      platform: "twitch",
      badges: [],
      segments: [
        { type: "text", text: "Hi " },
        {
          type: "emote",
          url: "https://cdn.example.com/emotes/kappa.png",
          alt: "Kappa",
        },
      ],
    });
  });

  it("skips overlapping emote ranges safely", () => {
    const packet = {
      event: { source: "Twitch" },
      data: {
        user: { name: "OverlapUser" },
        message: {
          message: {
            text: "Hello Kappa Keepo",
            emotes: [
              {
                name: "Kappa",
                startIndex: 6,
                endIndex: 10,
                imageUrl: "https://cdn.example.com/emotes/kappa.png",
              },
              {
                name: "BadOverlap",
                startIndex: 8,
                endIndex: 12,
                imageUrl: "https://cdn.example.com/emotes/overlap.png",
              },
              {
                name: "Keepo",
                startIndex: 12,
                endIndex: 16,
                imageUrl: "https://cdn.example.com/emotes/keepo.png",
              },
            ],
          },
        },
      },
    };

    expect(parseChatEvent(packet)).toEqual({
      user: "OverlapUser",
      message: "Hello Kappa Keepo",
      platform: "twitch",
      badges: [],
      segments: [
        { type: "text", text: "Hello " },
        {
          type: "emote",
          url: "https://cdn.example.com/emotes/kappa.png",
          alt: "Kappa",
        },
        { type: "text", text: " " },
        {
          type: "emote",
          url: "https://cdn.example.com/emotes/keepo.png",
          alt: "Keepo",
        },
      ],
    });
  });

  it("ignores invalid emote ranges without image URLs", () => {
    const packet = {
      event: { source: "Twitch" },
      data: {
        user: { name: "NoUrlUser" },
        message: {
          message: {
            text: "Hi Nope",
            emotes: [
              {
                name: "Nope",
                startIndex: 3,
                endIndex: 6,
              },
            ],
          },
        },
      },
    };

    expect(parseChatEvent(packet)).toEqual({
      user: "NoUrlUser",
      message: "Hi Nope",
      platform: "twitch",
      badges: [],
      segments: [{ type: "text", text: "Hi Nope" }],
    });
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
      segments: [{ type: "text", text: "Hello from moderation" }],
    });
  });

  it("preserves normalized moderation message segments", () => {
    const packet = {
      type: "chat.message",
      source: "twitch",
      actor: { displayName: "Alice" },
      payload: {
        message: "GG Party",
        segments: [
          { type: "text", text: "GG " },
          {
            type: "emote",
            url: "https://cdn.example.com/emotes/party.png",
            alt: "Party",
          },
        ],
      },
    };

    expect(parseModerationChatEvent(packet)).toEqual({
      user: "Alice",
      message: "GG Party",
      platform: "twitch",
      badges: [],
      segments: [
        { type: "text", text: "GG " },
        {
          type: "emote",
          url: "https://cdn.example.com/emotes/party.png",
          alt: "Party",
        },
      ],
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
      segments: [{ type: "text", text: "Approved legacy event" }],
    });
  });

  it("ignores unsafe image URLs in structured payloads", () => {
    const packet = {
      event: { source: "Twitch" },
      data: {
        user: { name: "Mallory", badges: [{ imageUrl: "javascript:alert(1)" }] },
        message: {
          message: {
            fragments: [
              {
                emote: {
                  name: "Bad",
                  imageUrl: "javascript:alert(1)",
                },
              },
            ],
          },
        },
      },
    };

    expect(parseChatEvent(packet)).toEqual({
      user: "Mallory",
      message: "Bad",
      platform: "twitch",
      badges: [],
      segments: [{ type: "text", text: "Bad" }],
    });
  });

  it("drops unsupported moderation payloads safely", () => {
    expect(parseModerationChatEvent({ type: "donation.received" })).toBeNull();
    expect(
      parseModerationChatEvent({ eventType: "overlay.message", username: "NoText" }),
    ).toBeNull();
  });
});
