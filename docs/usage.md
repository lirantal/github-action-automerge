# Usage

This action is designed to run whenever a pull request changes or when external systems finish reporting checks for a commit.

## Recommended Workflow

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
    runs-on: ubuntu-latest
    steps:
      - uses: lirantal/automerge@v1
```

The `pull_request` trigger handles label changes, new commits, reopening, and ready-for-review changes. The `check_run` and `status` triggers let the action re-run when GitHub Actions or external integrations report a result after the pull request event.

## Configuration

The defaults are intentionally conservative:

```yaml
- uses: lirantal/automerge@v1
  with:
    label: automerge
    require-label: "true"
    allow-forks: "false"
    merge-method: squash
    green-observations-required: "4"
    poll-interval-seconds: "60"
    timeout-seconds: "3600"
```

## Merge Methods

Use `merge-method` to choose the GitHub merge strategy:

```yaml
- uses: lirantal/automerge@v1
  with:
    merge-method: merge
```

Supported values are `merge`, `squash`, and `rebase`. The repository must allow the selected merge method in its GitHub settings.

## Custom Labels

```yaml
- uses: lirantal/automerge@v1
  with:
    label: ready-to-merge
```

Set `require-label: "false"` only for repositories where every eligible pull request should be considered for automerge.

## Stability Window

The action does not merge on the first green observation. By default it requires four consecutive green observations separated by 60 seconds.

```yaml
- uses: lirantal/automerge@v1
  with:
    green-observations-required: "2"
    poll-interval-seconds: "30"
```

This gives late-created check runs and commit statuses time to appear before the pull request is merged.
