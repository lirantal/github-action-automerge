# Automerge

A GitHub Action that safely merges pull requests after their visible commit statuses and check runs are green.

Use it when you want automerge to be explicit, conservative, and easy to audit: a pull request must opt in with a label, must not be a draft, must not come from a fork by default, and must stay green for a short stability window before it is merged.

## Why

GitHub's built-in auto-merge is useful, but some repositories need the merge policy to live in workflow code instead of only in branch protection settings. This action gives maintainers a small, reviewable gate that can react to pull request updates, completed check runs, and commit status events.

The action helps avoid common automerge races by checking the current pull request head SHA, waiting for repeated green observations, then merging only if GitHub confirms the head SHA is still the one that was checked.

## Quick Start

Create `.github/workflows/automerge.yml`:

```yaml
name: Automerge

on:
  pull_request:
    types:
      - labeled
      - unlabeled
      - synchronize
      - opened
      - edited
      - ready_for_review
      - reopened
  check_run:
    types:
      - completed
  status:

permissions:
  contents: write
  pull-requests: write
  checks: read
  statuses: read

jobs:
  automerge:
    name: Automerge
    runs-on: ubuntu-latest
    steps:
      - name: Merge eligible pull requests
        uses: lirantal/automerge@v1
```

Add the `automerge` label to a pull request. When all visible statuses and check runs on the PR head SHA are successful for the configured stability window, the action merges the pull request with a squash merge by default.

## Safety Model

- Pull requests must be open and not drafts.
- Pull requests must have the configured label unless `require-label` is disabled.
- Pull requests from forks are skipped unless `allow-forks` is enabled.
- A pull request with zero visible statuses/check runs is never treated as green.
- Pending, failed, cancelled, timed-out, skipped, neutral, queued, and in-progress checks are not treated as green.
- The action refreshes the pull request before merging and passes the checked head SHA to GitHub's merge API.

## Inputs

- `github-token`: GitHub token used to read pull requests, checks, statuses, and merge pull requests. Defaults to `${{ github.token }}`.
- `merge-method`: Merge method, one of `merge`, `squash`, or `rebase`. Defaults to `squash`.
- `label`: Label required for automerge when `require-label` is `true`. Defaults to `automerge`.
- `require-label`: Require the configured label before merging. Defaults to `true`.
- `allow-forks`: Allow pull requests from forks. Defaults to `false`.
- `green-observations-required`: Consecutive green observations required before merging. Defaults to `4`.
- `poll-interval-seconds`: Seconds between check observations. Defaults to `60`.
- `timeout-seconds`: Maximum seconds to wait for green checks. Defaults to `3600`.
- `ignored-check-names`: Comma-separated check run names to ignore. Defaults to `automerge,Automerge`.

## Outputs

- `merged`: `true` when the pull request was merged.
- `reason`: The merge or skip reason.
- `pull-request-number`: Pull request number considered by the action.
- `head-sha`: Pull request head SHA considered by the action.
- `merge-sha`: Merge SHA returned by GitHub when a pull request is merged.

## Examples

Use rebase merges:

```yaml
- uses: lirantal/automerge@v1
  with:
    merge-method: rebase
```

Use a custom label:

```yaml
- uses: lirantal/automerge@v1
  with:
    label: safe-to-merge
```

Shorten the stability window:

```yaml
- uses: lirantal/automerge@v1
  with:
    green-observations-required: 2
    poll-interval-seconds: 30
```

## Documentation

- [Usage](docs/usage.md)
- [Permissions](docs/permissions.md)
- [Security](docs/security.md)
- [Design](docs/design.md)

## Development

This repository uses Node.js 24 and pnpm 11.

```bash
corepack enable
corepack prepare pnpm@11.2.2 --activate
pnpm install
pnpm all
```

The bundled `dist/` output is committed because JavaScript actions must include their runtime dependencies.

## License

Apache-2.0
