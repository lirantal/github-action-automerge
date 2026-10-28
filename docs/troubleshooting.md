# Troubleshooting

Start with the logs for the step running this action. Distinguish a skipped pull request, a timeout waiting for checks, and a merge API rejection: each requires a different fix.

## Checks Pass, but Merging Fails with a Workflows Permission Error

A typical failure ends with:

```text
refusing to allow a GitHub App to create or update workflow `.github/workflows/ci.yml` without `workflows` permission
```

The action may first log all configured green observations. That means the check gate passed; the subsequent merge request was rejected because applying the pull request would change a workflow file.

Inspect the pull request's changed files for paths under `.github/workflows/`. A Dependabot package update that changes `package.json` and a lockfile can merge with the default token, while an action update that changes `.github/workflows/ci.yml` can fail with the exact same automerge workflow.

Follow the [workflow-file credential workaround](permissions.md#pull-requests-that-change-workflow-files), or merge that pull request manually. Adding `actions: write`, changing the polling interval, increasing the timeout, or rerunning with the same credential does not supply the missing authorization.

## Other Merge API Rejections

The action calls GitHub's merge API after checks pass; it does not bypass GitHub's merge requirements.

- Confirm the token can access the repository and has the [required permissions](permissions.md).
- Inspect the pull request's merge box for conflicts, required approvals, branch protection, or ruleset requirements.
- Confirm the repository allows the configured `merge-method`.
- If a new commit arrived, check the latest head and its checks. A head SHA mismatch prevents merging an unverified commit.

Address the reported requirement before retrying. A green stability window does not guarantee that GitHub will accept the merge.

## The Action Succeeds without Merging

A successful job can represent an intentional skip. Read the logged reason and, when consumed by later steps, the `merged` and `reason` outputs.

The action skips pull requests that are closed, drafts, missing the required label, or from forks when `allow-forks` is disabled. It also returns without merging when no open pull request can be resolved for the event or when the head changes after the stability window.

## Waiting for Checks Times Out

The timeout message lists checks or statuses that remain non-green. Inspect those results on the current PR head.

- At least one visible, non-ignored check run or commit status must exist.
- All visible commit statuses must be successful. Non-ignored check runs must be completed with `success`, `neutral`, or `skipped`.
- The automerge job must be ignored by its actual check name, or it can wait for itself. The default ignored names are `automerge,Automerge`; update `ignored-check-names` if you rename the job.
- Failed or cancelled checks need attention. Increase `timeout-seconds` only when checks legitimately need more time.

## Scope of the Green Check Gate

The action observes checks and statuses already visible on the PR head SHA. It does not discover an expected set of CI jobs or guarantee that a delayed check will appear. Repeated green observations reduce that timing risk; configure repository required checks when a specific check must gate merging.

Eligibility defaults to an open, non-draft, same-repository pull request carrying the `automerge` label. The label is opt-in merge authorization; the action does not classify dependency updates or restrict eligible pull requests to particular file paths. See [usage](usage.md), [permissions](permissions.md), and [security](security.md) when choosing a policy.
