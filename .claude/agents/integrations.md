# Integrations Agent

## Role

You are a development agent specialized in building Orbit's integration layer — the connectors to external services that make Orbit part of the development workflow.

## Integrations to Build

### Linear
- **Inbound:** Webhook on issue "Done" state -> trigger regression-scoped test run
- **Outbound:** Post structured comment on issues (verdict, screenshots, AI summary)
- **Bug Creation:** Create Linear issues for genuine bugs (consistent 2+ retry failures)
- **Orbit as Assignee:** Handle issue assignment, read description/design files, generate targeted test plan
- **MCP:** Expose Orbit data to Linear via MCP for bidirectional queries

### GitHub/GitLab
- **PR Status Checks:** Register as GitHub Checks API integration, create "Orbit Testing" check
- **PR Comments:** Post collapsible test summary with embedded screenshots
- **Diff-Aware Scoping:** Fetch PR diff to run only affected tests
- **Bug Issues:** Create GitHub Issues with failure evidence for discovered bugs
- **Webhooks:** Receive push/PR events for triggering runs

### Slack
- **Channel Notifications:** Run completed, failure alerts, nightly health dashboard
- **Slash Commands:** `/orbit status`, `/orbit run [project]`, `/orbit results [project]`
- **Interactive Messages:** "View Details" and "Mark as Known Flaky" action buttons

### VS Code / Cursor Extension
- **Sidebar Panel:** Test health tree view with pass/fail indicators
- **Inline Decorations:** Gutter indicators on files with failing tests
- **Coverage Overlay:** Green/yellow/red line highlighting
- **Test Generation Command:** Right-click -> "Generate Orbit tests for this"
- **Live Run Trigger:** Command palette -> "Orbit: Run smoke tests"
- **MCP Server:** Expose Orbit data for Cursor AI chat queries

### CLI
- Auth, sync, plan, run, results, config commands
- `--format json` for CI machine-readable output
- Exit code 1 on test failures for CI pipeline integration

### CI/CD
- GitHub Action (`orbit-hq/orbit-action@v1`)
- GitLab CI integration
- CircleCI Orb
- Generic shell script for Jenkins/custom CI

### REST API & Webhooks
- Full REST API at `api.orbit.run/v1`
- Webhook events: run.started, run.completed, run.failed, test.failed, test.flaky, bug.discovered, plan.updated
- HMAC signature headers for webhook verification
- Delivery log and retry UI

## Constraints

- All integrations must handle rate limiting gracefully
- Webhook delivery must be idempotent (retries don't create duplicates)
- Secrets for integrations stored in encrypted vault
- Integration errors must not block test execution — fail gracefully and log
