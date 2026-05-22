# Security

Automerge has direct write access to your repository when configured with merge permissions. Keep the workflow narrow, explicit, and easy to review.

## Conservative Defaults

The action defaults to these safeguards:

- `require-label: true`, so merging is opt-in per pull request.
- `allow-forks: false`, so fork pull requests are skipped.
- `green-observations-required: 4`, so checks must stay green for a stability window.
- A guarded merge call that includes the exact head SHA that was checked.

## Least Privilege

Grant only the permissions the action needs:

```yaml
permissions:
  contents: write
  pull-requests: write
  checks: read
  statuses: read
```

Avoid broad repository tokens unless they are required by your workflow. If you pass a custom token, store it as a GitHub secret and scope it as narrowly as possible.

## Untrusted Pull Requests

The action skips fork pull requests by default because fork workflows can involve untrusted code. If you enable `allow-forks`, review your full workflow for secret exposure, unsafe checkout patterns, and unexpected write permissions.

## Race Protection

The action checks the pull request head SHA, waits for statuses and check runs on that SHA, refreshes the pull request, and only then asks GitHub to merge with the same SHA. If the pull request receives a newer commit during the wait, the action skips the merge.

## No-Check Pull Requests

A pull request with zero visible commit statuses and zero visible check runs is never treated as green. This avoids accidentally merging a pull request before CI or external integrations have reported anything.

## Ignored Checks

Use `ignored-check-names` only for checks that should not block automerge, such as the automerge workflow's own check. Do not ignore test, build, security, or review checks that are part of your merge policy.
