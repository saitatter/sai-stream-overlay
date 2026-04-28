import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const releasePlugin = require("../scripts/semantic-release/expand-squash-commits.cjs");
const { expandSquashCommits, expandSquashCommitsWithPullRequestFallback } = releasePlugin;

describe("expandSquashCommits", () => {
  it("replaces squash commits with conventional commits from the body", () => {
    const commits = [
      {
        hash: "abc123",
        header: "feat(chat): add overlay polish (#12)",
        subject: "add overlay polish (#12)",
        type: "feat",
        body: [
          "* feat(chat): render custom emotes inline",
          "* fix(chat): skip overlapping emote ranges",
          "* docs(readme): document moderation mode",
          "Co-authored-by: Example <example@example.com>",
        ].join("\n"),
      },
    ];

    expect(expandSquashCommits(commits)).toEqual([
      expect.objectContaining({
        hash: "abc123-body-0",
        header: "feat(chat): render custom emotes inline",
        type: "feat",
        scope: "chat",
        subject: "render custom emotes inline",
      }),
      expect.objectContaining({
        hash: "abc123-body-1",
        header: "fix(chat): skip overlapping emote ranges",
        type: "fix",
        scope: "chat",
        subject: "skip overlapping emote ranges",
      }),
      expect.objectContaining({
        hash: "abc123-body-2",
        header: "docs(readme): document moderation mode",
        type: "docs",
        scope: "readme",
        subject: "document moderation mode",
      }),
    ]);
  });

  it("keeps normal commits unchanged", () => {
    const commits = [{ hash: "def456", header: "fix(config): parse demo flag", body: "" }];
    expect(expandSquashCommits(commits)).toEqual(commits);
  });

  it("expands commits before release notes are generated", async () => {
    const context = {
      commits: [
        {
          hash: "abc123",
          header: "feat(chat): add overlay polish (#12)",
          body: "* feat(chat): render custom emotes inline",
        },
      ],
    };

    await expect(releasePlugin.generateNotes({}, context)).resolves.toBeNull();
    expect(context.commits).toEqual([
      expect.objectContaining({
        header: "feat(chat): render custom emotes inline",
        type: "feat",
      }),
    ]);
  });

  it("uses GitHub PR commits when squash commit body is incomplete", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => [
        {
          sha: "111",
          commit: { message: "feat(chat): add structured emote payloads\n\nBody" },
        },
        {
          sha: "222",
          commit: { message: "fix(chat): preserve moderation emote segments" },
        },
      ],
    });

    try {
      const commits = await expandSquashCommitsWithPullRequestFallback(
        [
          {
            hash: "abc123",
            header: "feat(chat): add emoji rendering (#42)",
            body: "",
          },
        ],
        {
          env: {
            GITHUB_REPOSITORY: "saitatter/sai-stream-overlay",
            GITHUB_TOKEN: "test-token",
          },
        },
      );

      expect(commits).toEqual([
        expect.objectContaining({
          hash: "111-pr-0",
          header: "feat(chat): add structured emote payloads",
          type: "feat",
        }),
        expect.objectContaining({
          hash: "222-pr-1",
          header: "fix(chat): preserve moderation emote segments",
          type: "fix",
        }),
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
