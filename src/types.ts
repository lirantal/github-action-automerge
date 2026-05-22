export type MergeMethod = "merge" | "squash" | "rebase";

export interface ActionInputs {
  githubToken: string;
  mergeMethod: MergeMethod;
  label: string;
  requireLabel: boolean;
  allowForks: boolean;
  greenObservationsRequired: number;
  pollIntervalSeconds: number;
  timeoutSeconds: number;
  ignoredCheckNames: string[];
}

export interface Repository {
  owner: string;
  repo: string;
}

export interface ActionContext {
  eventName: string;
  repo: Repository;
  payload: Record<string, unknown>;
}

export interface PullRequestSummary {
  number: number;
  state: string;
  draft: boolean;
  htmlUrl: string;
  head: {
    sha: string;
    repoFullName: string | null;
  };
  labels: string[];
}

export interface CommitStatus {
  context: string;
  state: string;
}

export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

export interface CheckSnapshot {
  statuses: CommitStatus[];
  checkRuns: CheckRun[];
}

export interface MergeResult {
  merged: boolean;
  reason: string;
  pullRequestNumber?: number;
  headSha?: string;
  mergeSha?: string;
}

export interface MergeResponse {
  sha: string | null;
  merged: boolean;
  message: string;
}

export interface GitHubClient {
  getPullRequest(number: number): Promise<PullRequestSummary>;
  listPullRequestsAssociatedWithCommit(
    sha: string,
  ): Promise<PullRequestSummary[]>;
  getCheckSnapshot(ref: string): Promise<CheckSnapshot>;
  mergePullRequest(input: {
    number: number;
    sha: string;
    mergeMethod: MergeMethod;
  }): Promise<MergeResponse>;
}

export interface Logger {
  info(message: string): void;
  warning(message: string): void;
  debug(message: string): void;
}

export interface Clock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}
