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

## Pull Requests That Change Workflow Files

Merging a pull request applies its changes to the base branch. If those changes include files under `.github/workflows/`, GitHub requires the merging credential to be authorized to modify workflows. This includes version or SHA updates to actions in an existing workflow.

The default `GITHUB_TOKEN` cannot receive the Workflows permission. `actions: write` controls Actions operations, such as cancelling runs; it does not authorize workflow-file changes. There is no supported `workflows: write` key in a workflow's `permissions:` block.

Choose one of these approaches:

- Keep the default token for ordinary pull requests and merge workflow updates manually with an authorized account.
- Supply a separate credential through `github-token` when workflow updates must merge automatically.

For a separate credential, use one of:

| Credential | Additional authorization for workflow files |
| --- | --- |
| GitHub App installation token | Repository **Workflows: write** permission |
| Fine-grained personal access token | Repository **Workflows: write** permission |
| Classic personal access token | The **workflow** scope, alongside repository access |

Workflows authorization is additional to the permissions needed to read pull requests, checks, and statuses and merge changes. Restrict the credential to the intended repositories where supported.

For a personal access token stored as the repository secret `AUTOMERGE_TOKEN`:

```yaml
- uses: lirantal/github-action-automerge@e2d68a8230f993393412ac28362eb4e6108ca93c # 1.0.2
  with:
    github-token: ${{ secrets.AUTOMERGE_TOKEN }}
```

For a GitHub App, generate an installation token in the workflow and pass that token to the same input. The app must be installed on the repository with the required permissions. The workflow's `permissions:` block only configures `GITHUB_TOKEN`; it does not grant permissions to a separate token.

The credential must also be available to the triggering event. Dependabot `pull_request` workflows normally have a read-only `GITHUB_TOKEN` and use Dependabot secrets rather than Actions secrets. If using a PAT in such a workflow, configure the secret in Dependabot's secret store as well. Fork pull requests have their own token and secret restrictions; setting `allow-forks: "true"` does not remove them. Keep privileged merge jobs separate from executing untrusted pull request code.

References: [workflow token permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions), [granting additional permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token#granting-additional-permissions), and [automating Dependabot](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/automating-dependabot-with-github-actions).

## Forks

Fork pull requests are skipped by default. Enabling fork automerge requires careful review because forked pull requests can involve untrusted code and different token behavior.

```yaml
- uses: lirantal/automerge@v1
  with:
    allow-forks: "true"
```

Only enable this in repositories where you fully understand the security trade-offs.
