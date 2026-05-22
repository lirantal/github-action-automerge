import { describe, expect, it } from "vitest";
import {
  evaluateCheckSnapshot,
  resolvePullRequest,
  runAutomerge,
} from "../src/automerge.js";
import type {
  ActionContext,
  ActionInputs,
  CheckSnapshot,
  Clock,
  GitHubClient,
  Logger,
  MergeMethod,
  MergeResponse,
  PullRequestSummary,
} from "../src/types.js";

class FakeGitHubClient implements GitHubClient {
  pullRequestResponses: PullRequestSummary[] = [];
  associatedPullRequests: PullRequestSummary[] = [];
  checkSnapshots: CheckSnapshot[] = [];
  mergeCalls: Array<{ number: number; sha: string; mergeMethod: MergeMethod }> =
    [];
  mergeResponse: MergeResponse = {
    sha: "merge-sha",
    merged: true,
    message: "Pull Request successfully merged",
  };

  async getPullRequest(): Promise<PullRequestSummary> {
    const response =
      this.pullRequestResponses.shift() ?? this.pullRequestResponses.at(-1);
    if (!response) {
      throw new Error("No pull request response configured");
    }

    return response;
  }

  async listPullRequestsAssociatedWithCommit(): Promise<PullRequestSummary[]> {
    return this.associatedPullRequests;
  }

  async getCheckSnapshot(): Promise<CheckSnapshot> {
    const snapshot = this.checkSnapshots.shift() ?? this.checkSnapshots.at(-1);
    if (!snapshot) {
      throw new Error("No check snapshot configured");
    }

    return snapshot;
  }

  async mergePullRequest(input: {
    number: number;
    sha: string;
    mergeMethod: MergeMethod;
  }): Promise<MergeResponse> {
    this.mergeCalls.push(input);
    return this.mergeResponse;
  }
}

class TestLogger implements Logger {
  messages: string[] = [];

  info(message: string): void {
    this.messages.push(message);
  }

  warning(message: string): void {
    this.messages.push(message);
  }

  debug(message: string): void {
    this.messages.push(message);
  }
}

class TestClock implements Clock {
  sleeps: number[] = [];

  now(): number {
    return 0;
  }

  async sleep(milliseconds: number): Promise<void> {
    this.sleeps.push(milliseconds);
  }
}

describe("runAutomerge", () => {
  it.each([
    ["closed pull request", { state: "closed" }, "Pull request is not open."],
    ["draft pull request", { draft: true }, "Pull request is a draft."],
    [
      "pull request without label",
      { labels: [] },
      "Pull request does not have the automerge label.",
    ],
    [
      "fork pull request",
      { head: { sha: "head-sha", repoFullName: "someone/fork" } },
      "Pull request is from a fork.",
    ],
  ])("skips a %s", async (_name, overrides, reason) => {
    const client = new FakeGitHubClient();
    client.pullRequestResponses = [pullRequest(overrides)];

    const result = await runAutomerge({
      client,
      context: pullRequestContext(),
      inputs: inputs(),
      logger: new TestLogger(),
      clock: new TestClock(),
    });

    expect(result).toMatchObject({
      merged: false,
      reason,
    });
    expect(client.mergeCalls).toHaveLength(0);
  });

  it("does not merge when no statuses or check runs exist", async () => {
    const client = new FakeGitHubClient();
    client.pullRequestResponses = [pullRequest(), pullRequest()];
    client.checkSnapshots = [
      { statuses: [], checkRuns: [] },
      { statuses: [], checkRuns: [] },
    ];

    await expect(
      runAutomerge({
        client,
        context: pullRequestContext(),
        inputs: inputs({ greenObservationsRequired: 1, timeoutSeconds: 1 }),
        logger: new TestLogger(),
        clock: new TestClock(),
      }),
    ).rejects.toThrow("No commit statuses or check runs found");

    expect(client.mergeCalls).toHaveLength(0);
  });

  it("requires repeated green observations before merging", async () => {
    const client = new FakeGitHubClient();
    client.pullRequestResponses = [pullRequest(), pullRequest()];
    client.checkSnapshots = [greenSnapshot(), greenSnapshot()];

    const result = await runAutomerge({
      client,
      context: pullRequestContext(),
      inputs: inputs({ greenObservationsRequired: 2 }),
      logger: new TestLogger(),
      clock: new TestClock(),
    });

    expect(result).toMatchObject({
      merged: true,
      headSha: "head-sha",
      mergeSha: "merge-sha",
    });
    expect(client.mergeCalls).toHaveLength(1);
  });

  it("does not merge when the pull request head changes after checks pass", async () => {
    const client = new FakeGitHubClient();
    client.pullRequestResponses = [
      pullRequest(),
      pullRequest({ head: { sha: "new-sha", repoFullName: "owner/repo" } }),
    ];
    client.checkSnapshots = [greenSnapshot()];

    const result = await runAutomerge({
      client,
      context: pullRequestContext(),
      inputs: inputs({ greenObservationsRequired: 1 }),
      logger: new TestLogger(),
      clock: new TestClock(),
    });

    expect(result).toMatchObject({
      merged: false,
      headSha: "new-sha",
    });
    expect(result.reason).toContain("Pull request head changed");
    expect(client.mergeCalls).toHaveLength(0);
  });

  it("merges with the exact head SHA and configured merge method", async () => {
    const client = new FakeGitHubClient();
    client.pullRequestResponses = [pullRequest(), pullRequest()];
    client.checkSnapshots = [greenSnapshot()];

    await runAutomerge({
      client,
      context: pullRequestContext(),
      inputs: inputs({ greenObservationsRequired: 1, mergeMethod: "rebase" }),
      logger: new TestLogger(),
      clock: new TestClock(),
    });

    expect(client.mergeCalls).toEqual([
      {
        number: 123,
        sha: "head-sha",
        mergeMethod: "rebase",
      },
    ]);
  });
});

describe("evaluateCheckSnapshot", () => {
  it.each([
    [
      "pending status",
      { statuses: [{ context: "ci", state: "pending" }], checkRuns: [] },
      "ci: pending",
    ],
    [
      "skipped check",
      {
        statuses: [],
        checkRuns: [
          { name: "test", status: "completed", conclusion: "skipped" },
        ],
      },
      "test: completed / skipped",
    ],
    [
      "neutral check",
      {
        statuses: [],
        checkRuns: [
          { name: "test", status: "completed", conclusion: "neutral" },
        ],
      },
      "test: completed / neutral",
    ],
    [
      "in-progress check",
      {
        statuses: [],
        checkRuns: [{ name: "test", status: "in_progress", conclusion: null }],
      },
      "test: in_progress / pending",
    ],
  ])("treats a %s as not green", (_name, snapshot, problem) => {
    const result = evaluateCheckSnapshot(snapshot, []);

    expect(result.green).toBe(false);
    expect(result.problems).toContain(problem);
  });

  it("ignores configured check names", () => {
    const result = evaluateCheckSnapshot(
      {
        statuses: [{ context: "ci", state: "success" }],
        checkRuns: [
          { name: "automerge", status: "completed", conclusion: "failure" },
        ],
      },
      ["automerge"],
    );

    expect(result.green).toBe(true);
  });
});

describe("resolvePullRequest", () => {
  it("resolves from a pull_request event", async () => {
    const client = new FakeGitHubClient();
    client.pullRequestResponses = [pullRequest({ number: 456 })];

    const result = await resolvePullRequest(
      client,
      pullRequestContext({ number: 456 }),
    );

    expect(result?.number).toBe(456);
  });

  it("resolves from a check_run event", async () => {
    const client = new FakeGitHubClient();
    client.associatedPullRequests = [
      pullRequest({ state: "closed" }),
      pullRequest({ number: 789 }),
    ];

    const result = await resolvePullRequest(client, {
      eventName: "check_run",
      repo: { owner: "owner", repo: "repo" },
      payload: { check_run: { head_sha: "head-sha" } },
    });

    expect(result?.number).toBe(789);
  });

  it("resolves from a status event", async () => {
    const client = new FakeGitHubClient();
    client.associatedPullRequests = [pullRequest({ number: 987 })];

    const result = await resolvePullRequest(client, {
      eventName: "status",
      repo: { owner: "owner", repo: "repo" },
      payload: { sha: "head-sha" },
    });

    expect(result?.number).toBe(987);
  });
});

function inputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    githubToken: "token",
    mergeMethod: "squash",
    label: "automerge",
    requireLabel: true,
    allowForks: false,
    greenObservationsRequired: 1,
    pollIntervalSeconds: 1,
    timeoutSeconds: 10,
    ignoredCheckNames: ["automerge", "Automerge"],
    ...overrides,
  };
}

function pullRequest(
  overrides: Partial<PullRequestSummary> = {},
): PullRequestSummary {
  return {
    number: 123,
    state: "open",
    draft: false,
    htmlUrl: "https://github.com/owner/repo/pull/123",
    head: {
      sha: "head-sha",
      repoFullName: "owner/repo",
    },
    labels: ["automerge"],
    ...overrides,
  };
}

function pullRequestContext(
  payload: Record<string, unknown> = { pull_request: { number: 123 } },
): ActionContext {
  return {
    eventName: "pull_request",
    repo: {
      owner: "owner",
      repo: "repo",
    },
    payload,
  };
}

function greenSnapshot(): CheckSnapshot {
  return {
    statuses: [{ context: "ci", state: "success" }],
    checkRuns: [{ name: "test", status: "completed", conclusion: "success" }],
  };
}
