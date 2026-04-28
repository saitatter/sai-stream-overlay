import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const releasePlugin = require("../scripts/semantic-release/expand-squash-commits.cjs");
const { expandSquashCommits } = releasePlugin;

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

  it("expands commits before release notes are generated", () => {
    const context = {
      commits: [
        {
          hash: "abc123",
          header: "feat(chat): add overlay polish (#12)",
          body: "* feat(chat): render custom emotes inline",
        },
      ],
    };

    expect(releasePlugin.generateNotes({}, context)).toBeNull();
    expect(context.commits).toEqual([
      expect.objectContaining({
        header: "feat(chat): render custom emotes inline",
        type: "feat",
      }),
    ]);
  });
});
