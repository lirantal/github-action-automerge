import * as github from "@actions/github";
import type {
  CheckRun,
  CheckSnapshot,
  CommitStatus,
  GitHubClient,
  MergeMethod,
  MergeResponse,
  PullRequestSummary,
  Repository,
} from "./types.js";

type Octokit = ReturnType<typeof github.getOctokit>;

export function createGitHubClient(
  token: string,
  repo: Repository,
): GitHubClient {
  const octokit = github.getOctokit(token);

  return new OctokitGitHubClient(octokit, repo);
}

class OctokitGitHubClient implements GitHubClient {
  constructor(
    private readonly octokit: Octokit,
    private readonly repo: Repository,
  ) {}

  async getPullRequest(number: number): Promise<PullRequestSummary> {
    const response = await this.octokit.rest.pulls.get({
      ...this.repo,
      pull_number: number,
    });

    return mapPullRequest(response.data);
  }

  async listPullRequestsAssociatedWithCommit(
    sha: string,
  ): Promise<PullRequestSummary[]> {
    const response =
      await this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        ...this.repo,
        commit_sha: sha,
      });

    return response.data.map(mapPullRequest);
  }

  async getCheckSnapshot(ref: string): Promise<CheckSnapshot> {
    const [statuses, checkRuns] = await Promise.all([
      this.octokit.rest.repos.getCombinedStatusForRef({
        ...this.repo,
        ref,
      }),
      this.octokit.paginate(this.octokit.rest.checks.listForRef, {
        ...this.repo,
        ref,
        per_page: 100,
      }),
    ]);

    return {
      statuses: statuses.data.statuses.map((status): CommitStatus => {
        return {
          context: status.context,
          state: status.state,
        };
      }),
      checkRuns: checkRuns.map((checkRun): CheckRun => {
        return {
          name: checkRun.name,
          status: checkRun.status,
          conclusion: checkRun.conclusion,
        };
      }),
    };
  }

  async mergePullRequest(input: {
    number: number;
    sha: string;
    mergeMethod: MergeMethod;
  }): Promise<MergeResponse> {
    const response = await this.octokit.rest.pulls.merge({
      ...this.repo,
      pull_number: input.number,
      sha: input.sha,
      merge_method: input.mergeMethod,
    });

    return {
      sha: response.data.sha,
      merged: response.data.merged,
      message: response.data.message,
    };
  }
}

function mapPullRequest(pr: {
  number: number;
  state: string;
  draft?: boolean | null;
  html_url?: string;
  head: {
    sha: string;
    repo?: {
      full_name?: string | null;
    } | null;
  };
  labels?: Array<string | { name?: string | null }>;
}): PullRequestSummary {
  return {
    number: pr.number,
    state: pr.state,
    draft: pr.draft ?? false,
    htmlUrl: pr.html_url ?? "",
    head: {
      sha: pr.head.sha,
      repoFullName: pr.head.repo?.full_name ?? null,
    },
    labels: (pr.labels ?? [])
      .map((label) => {
        if (typeof label === "string") {
          return label;
        }

        return label.name ?? "";
      })
      .filter(Boolean),
  };
}
