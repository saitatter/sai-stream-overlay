const CONVENTIONAL_COMMIT_RE =
  /^(?:[-*]\s*)?(?<header>(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s+(?<subject>.+))$/;
const PR_NUMBER_RE = /\(#(?<number>\d+)\)/;

function getBodyLines(commit) {
  const body = typeof commit.body === "string" ? commit.body : "";
  if (body.trim()) return body.split(/\r?\n/);

  const message = typeof commit.message === "string" ? commit.message : "";
  return message.split(/\r?\n/).slice(1);
}

function parseConventionalCommitLine(commit, line, index, source = "body") {
  const match = String(line || "")
    .trim()
    .match(CONVENTIONAL_COMMIT_RE);
  if (!match?.groups) return null;

  const { header, type, scope, breaking, subject } = match.groups;
  return {
    ...commit,
    hash: `${commit.hash || "squash"}-${source}-${index}`,
    message: header,
    header,
    subject,
    type,
    scope: scope || null,
    body: "",
    footer: "",
    notes: breaking ? [{ title: "BREAKING CHANGE", text: subject }] : [],
    references: [],
  };
}

function extractSquashCommits(commit) {
  const seen = new Set();

  return getBodyLines(commit)
    .map((line) => line.trim())
    .map((line, index) => {
      const parsed = parseConventionalCommitLine(commit, line, index);
      if (!parsed || seen.has(parsed.header)) return null;
      seen.add(parsed.header);
      return parsed;
    })
    .filter(Boolean);
}

function extractPullRequestNumber(commit) {
  const fields = [commit.header, commit.subject, commit.message, commit.body].filter(Boolean);
  for (const field of fields) {
    const match = String(field).match(PR_NUMBER_RE);
    if (match?.groups?.number) return Number(match.groups.number);
  }
  return null;
}

function getRepositorySlug(context = {}) {
  const repository = context.env?.GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY;
  if (repository) return repository;

  const repositoryUrl = context.options?.repositoryUrl || process.env.GITHUB_REPOSITORY_URL || "";
  const match = repositoryUrl.match(/github\.com[/:](?<owner>[^/]+)\/(?<repo>[^/.]+)(?:\.git)?/);
  if (!match?.groups) return "";
  return `${match.groups.owner}/${match.groups.repo}`;
}

async function fetchPullRequestCommits(repository, pullRequestNumber, token) {
  if (!repository || !pullRequestNumber || !token || typeof fetch !== "function") return [];

  const commits = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/pulls/${pullRequestNumber}/commits?per_page=100&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!response.ok) return [];
    const pageCommits = await response.json();
    if (!Array.isArray(pageCommits) || pageCommits.length === 0) break;
    commits.push(...pageCommits);
    if (pageCommits.length < 100) break;
  }

  return commits;
}

async function extractPullRequestCommits(commit, context = {}) {
  const pullRequestNumber = extractPullRequestNumber(commit);
  const token = context.env?.GITHUB_TOKEN || context.env?.GH_TOKEN || process.env.GITHUB_TOKEN;
  const repository = getRepositorySlug(context);
  const pullRequestCommits = await fetchPullRequestCommits(repository, pullRequestNumber, token);
  const seen = new Set();

  return pullRequestCommits
    .map((item, index) => {
      const header = String(item?.commit?.message || "").split(/\r?\n/)[0];
      const parsed = parseConventionalCommitLine(
        {
          ...commit,
          hash: item?.sha || commit.hash,
        },
        header,
        index,
        "pr",
      );
      if (!parsed || seen.has(parsed.header)) return null;
      seen.add(parsed.header);
      return parsed;
    })
    .filter(Boolean);
}

function expandSquashCommits(commits = []) {
  return commits.flatMap((commit) => {
    const expanded = extractSquashCommits(commit);
    return expanded.length > 0 ? expanded : [commit];
  });
}

async function expandSquashCommitsWithPullRequestFallback(commits = [], context = {}) {
  const expandedCommits = [];

  for (const commit of commits) {
    const prCommits = await extractPullRequestCommits(commit, context);
    if (prCommits.length > 0) {
      expandedCommits.push(...prCommits);
      continue;
    }

    const expanded = extractSquashCommits(commit);
    expandedCommits.push(...(expanded.length > 0 ? expanded : [commit]));
  }

  return expandedCommits;
}

async function applyExpansion(context) {
  if (!Array.isArray(context.commits)) return;
  context.commits = await expandSquashCommitsWithPullRequestFallback(context.commits, context);
}

module.exports = {
  async analyzeCommits(_, context) {
    await applyExpansion(context);
    return null;
  },
  async generateNotes(_, context) {
    await applyExpansion(context);
    return null;
  },
  expandSquashCommits,
  expandSquashCommitsWithPullRequestFallback,
};
