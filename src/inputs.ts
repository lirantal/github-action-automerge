import * as core from "@actions/core";
import type { ActionInputs, MergeMethod } from "./types.js";

const mergeMethods = new Set<MergeMethod>(["merge", "squash", "rebase"]);

export function readInputs(): ActionInputs {
  return {
    githubToken: core.getInput("github-token", { required: true }),
    mergeMethod: parseMergeMethod(core.getInput("merge-method") || "squash"),
    label: core.getInput("label") || "automerge",
    requireLabel: parseBoolean(
      core.getInput("require-label"),
      "require-label",
      true,
    ),
    allowForks: parseBoolean(
      core.getInput("allow-forks"),
      "allow-forks",
      false,
    ),
    greenObservationsRequired: parsePositiveInteger(
      core.getInput("green-observations-required"),
      "green-observations-required",
      4,
    ),
    pollIntervalSeconds: parsePositiveInteger(
      core.getInput("poll-interval-seconds"),
      "poll-interval-seconds",
      60,
    ),
    timeoutSeconds: parsePositiveInteger(
      core.getInput("timeout-seconds"),
      "timeout-seconds",
      3600,
    ),
    ignoredCheckNames: parseCsv(
      core.getInput("ignored-check-names") || "automerge,Automerge",
    ),
  };
}

function parseMergeMethod(value: string): MergeMethod {
  const normalized = value.trim().toLowerCase();
  if (!mergeMethods.has(normalized as MergeMethod)) {
    throw new Error(
      `merge-method must be one of: ${Array.from(mergeMethods).join(", ")}`,
    );
  }

  return normalized as MergeMethod;
}

function parseBoolean(
  value: string,
  name: string,
  defaultValue: boolean,
): boolean {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  throw new Error(`${name} must be a boolean value`);
}

function parsePositiveInteger(
  value: string,
  name: string,
  defaultValue: number,
): number {
  const parsed = parseInteger(value, name, defaultValue);
  if (parsed < 1) {
    throw new Error(`${name} must be greater than 0`);
  }

  return parsed;
}

function parseInteger(
  value: string,
  name: string,
  defaultValue: number,
): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }

  return parsed;
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
