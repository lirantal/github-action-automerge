# Permissions

The action uses GitHub's REST API to read pull requests, read checks/statuses, and merge eligible pull requests.

## Recommended Permissions

```yaml
permissions:
  contents: write
  pull-requests: write
  checks: read
  statuses: read
```

`contents: write` and `pull-requests: write` are required for merging pull requests with the default `GITHUB_TOKEN`. `checks: read` and `statuses: read` let the action inspect both GitHub Checks API results and commit statuses from older or external integrations.

## Token

By default the action uses `${{ github.token }}` through the `github-token` input.

```yaml
- uses: lirantal/automerge@v1
  with:
    github-token: ${{ github.token }}
```

If your repository or organization restricts the default token, provide a token with equivalent permissions. Prefer the least-privileged token that can read pull requests/checks/statuses and merge pull requests.

## Forks

Fork pull requests are skipped by default. Enabling fork automerge requires careful review because forked pull requests can involve untrusted code and different token behavior.

```yaml
- uses: lirantal/automerge@v1
  with:
    allow-forks: "true"
```

Only enable this in repositories where you fully understand the security trade-offs.
