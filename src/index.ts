import * as core from "@actions/core";
import * as github from "@actions/github";
import { runAutomerge } from "./automerge.js";
import { systemClock } from "./clock.js";
import { createGitHubClient } from "./github.js";
import { readInputs } from "./inputs.js";
import type { ActionContext, MergeResult } from "./types.js";

export async function run(): Promise<void> {
  try {
    const inputs = readInputs();
    const context: ActionContext = {
      eventName: github.context.eventName,
      repo: github.context.repo,
      payload: github.context.payload as Record<string, unknown>,
    };
    const client = createGitHubClient(inputs.githubToken, context.repo);
    const result = await runAutomerge({
      client,
      context,
      inputs,
      logger: core,
      clock: systemClock,
    });

    setOutputs(result);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

function setOutputs(result: MergeResult): void {
  core.setOutput("merged", String(result.merged));
  core.setOutput("reason", result.reason);

  if (result.pullRequestNumber !== undefined) {
    core.setOutput("pull-request-number", String(result.pullRequestNumber));
  }

  if (result.headSha) {
    core.setOutput("head-sha", result.headSha);
  }

  if (result.mergeSha) {
    core.setOutput("merge-sha", result.mergeSha);
  }
}

void run();
