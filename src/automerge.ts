import type {
  ActionContext,
  ActionInputs,
  CheckRun,
  CheckSnapshot,
  Clock,
  CommitStatus,
  GitHubClient,
  Logger,
  MergeResult,
  PullRequestSummary,
} from "./types.js";

interface CheckEvaluation {
  green: boolean;
  summary: string;
  problems: string[];
}

export async function runAutomerge(input: {
  client: GitHubClient;
  context: ActionContext;
  inputs: ActionInputs;
  logger: Logger;
  clock: Clock;
}): Promise<MergeResult> {
  const { client, context, inputs, logger, clock } = input;
  const pullRequest = await resolvePullRequest(client, context);

  if (!pullRequest) {
    return {
      merged: false,
      reason: "No open pull request found for this event.",
    };
  }

  const baseResult = {
    pullRequestNumber: pullRequest.number,
    headSha: pullRequest.head.sha,
  };
  const eligibility = getEligibility(pullRequest, context, inputs);
  if (!eligibility.eligible) {
    logger.info(eligibility.reason);
    return {
      ...baseResult,
      merged: false,
      reason: eligibility.reason,
    };
  }

  await waitForStableGreen({
    client,
    headSha: pullRequest.head.sha,
    inputs,
    logger,
    clock,
  });

  const refreshedPullRequest = await client.getPullRequest(pullRequest.number);
  if (refreshedPullRequest.head.sha !== pullRequest.head.sha) {
    const reason = `Pull request head changed from ${pullRequest.head.sha} to ${refreshedPullRequest.head.sha}.`;
    logger.warning(reason);
    return {
      pullRequestNumber: pullRequest.number,
      headSha: refreshedPullRequest.head.sha,
      merged: false,
      reason,
    };
  }

  const merge = await client.mergePullRequest({
    number: pullRequest.number,
    sha: pullRequest.head.sha,
    mergeMethod: inputs.mergeMethod,
  });

  return {
    ...baseResult,
    merged: merge.merged,
    mergeSha: merge.sha ?? undefined,
    reason: merge.message,
  };
}

export async function resolvePullRequest(
  client: GitHubClient,
  context: ActionContext,
): Promise<PullRequestSummary | null> {
  if (
    context.eventName === "pull_request" ||
    context.eventName === "pull_request_target"
  ) {
    const pullRequestNumber = getPullRequestNumber(context.payload);
    if (pullRequestNumber !== null) {
      return client.getPullRequest(pullRequestNumber);
    }
  }

  const sha = getEventSha(context);
  if (!sha) {
    return null;
  }

  const pullRequests = await client.listPullRequestsAssociatedWithCommit(sha);
  return (
    pullRequests.find((pullRequest) => pullRequest.state === "open") ?? null
  );
}

function getEligibility(
  pullRequest: PullRequestSummary,
  context: ActionContext,
  inputs: ActionInputs,
):
  | { eligible: true; reason: "eligible" }
  | { eligible: false; reason: string } {
  if (pullRequest.state !== "open") {
    return { eligible: false, reason: "Pull request is not open." };
  }

  if (pullRequest.draft) {
    return { eligible: false, reason: "Pull request is a draft." };
  }

  const repositoryFullName = `${context.repo.owner}/${context.repo.repo}`;
  if (
    !inputs.allowForks &&
    pullRequest.head.repoFullName !== repositoryFullName
  ) {
    return { eligible: false, reason: "Pull request is from a fork." };
  }

  if (inputs.requireLabel && !pullRequest.labels.includes(inputs.label)) {
    return {
      eligible: false,
      reason: `Pull request does not have the ${inputs.label} label.`,
    };
  }

  return { eligible: true, reason: "eligible" };
}

async function waitForStableGreen(input: {
  client: GitHubClient;
  headSha: string;
  inputs: ActionInputs;
  logger: Logger;
  clock: Clock;
}): Promise<void> {
  const { client, headSha, inputs, logger, clock } = input;
  let greenObservations = 0;
  let lastEvaluation: CheckEvaluation | null = null;
  const maxAttempts = getMaxAttempts(
    inputs.timeoutSeconds,
    inputs.pollIntervalSeconds,
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const snapshot = await client.getCheckSnapshot(headSha);
    const evaluation = evaluateCheckSnapshot(
      snapshot,
      inputs.ignoredCheckNames,
    );
    lastEvaluation = evaluation;

    if (evaluation.green) {
      greenObservations += 1;
      logger.info(
        `All visible checks passed for ${headSha} (${greenObservations}/${inputs.greenObservationsRequired}).`,
      );
    } else {
      greenObservations = 0;
      logger.info(
        `Waiting for all checks to pass for ${headSha} (attempt ${attempt}/${maxAttempts}).`,
      );
      logger.info(evaluation.summary);
    }

    if (greenObservations >= inputs.greenObservationsRequired) {
      return;
    }

    if (attempt < maxAttempts) {
      await clock.sleep(inputs.pollIntervalSeconds * 1000);
    }
  }

  const details = lastEvaluation?.problems.length
    ? ` ${lastEvaluation.problems.join("; ")}`
    : "";
  throw new Error(
    `Timed out waiting for all commit statuses and check runs to pass for ${headSha}.${details}`,
  );
}

export function evaluateCheckSnapshot(
  snapshot: CheckSnapshot,
  ignoredCheckNames: string[],
): CheckEvaluation {
  const ignored = new Set(ignoredCheckNames);
  const checkRuns = snapshot.checkRuns.filter(
    (checkRun) => !ignored.has(checkRun.name),
  );
  const nonSuccessStatuses = snapshot.statuses.filter(
    (status) => status.state !== "success",
  );
  const nonSuccessCheckRuns = checkRuns.filter(
    (checkRun) =>
      checkRun.status !== "completed" || checkRun.conclusion !== "success",
  );

  if (snapshot.statuses.length === 0 && checkRuns.length === 0) {
    return {
      green: false,
      summary: "No commit statuses or check runs found yet.",
      problems: ["No commit statuses or check runs found."],
    };
  }

  if (nonSuccessStatuses.length === 0 && nonSuccessCheckRuns.length === 0) {
    return {
      green: true,
      summary: "All visible checks passed.",
      problems: [],
    };
  }

  const problems = [
    ...nonSuccessStatuses.map(formatStatusProblem),
    ...nonSuccessCheckRuns.map(formatCheckRunProblem),
  ];

  return {
    green: false,
    summary: problems.join("\n"),
    problems,
  };
}

function getMaxAttempts(
  timeoutSeconds: number,
  pollIntervalSeconds: number,
): number {
  if (pollIntervalSeconds === 0) {
    return timeoutSeconds;
  }

  return Math.max(1, Math.floor(timeoutSeconds / pollIntervalSeconds) + 1);
}

function formatStatusProblem(status: CommitStatus): string {
  return `${status.context}: ${status.state}`;
}

function formatCheckRunProblem(checkRun: CheckRun): string {
  return `${checkRun.name}: ${checkRun.status} / ${checkRun.conclusion ?? "pending"}`;
}

function getPullRequestNumber(payload: Record<string, unknown>): number | null {
  const pullRequest = getRecord(payload.pull_request);
  if (pullRequest) {
    return getNumber(pullRequest.number);
  }

  return getNumber(payload.number);
}

function getEventSha(context: ActionContext): string | null {
  if (context.eventName === "check_run") {
    const checkRun = getRecord(context.payload.check_run);
    return getString(checkRun?.head_sha);
  }

  if (context.eventName === "status") {
    return getString(context.payload.sha);
  }

  return null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
