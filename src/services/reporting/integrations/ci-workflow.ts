/**
 * Generates a GitHub Actions workflow YAML for users to add to their repos.
 * This workflow triggers Orbit tests on push/PR events via Orbit's API.
 */

interface WorkflowConfig {
  mode: "regression" | "smoke" | "full";
  environment: string;
  failOnFailure: boolean;
  branches: string[];
}

const DEFAULT_CONFIG: WorkflowConfig = {
  mode: "regression",
  environment: "staging",
  failOnFailure: true,
  branches: ["main", "master"],
};

export function generateGitHubActionsWorkflow(
  config: Partial<WorkflowConfig> = {}
): string {
  const merged = { ...DEFAULT_CONFIG, ...config };
  const branchList = merged.branches.map((b) => `'${b}'`).join(", ");

  return `# Orbit CI — AI-Powered Test Suite
# Add this file to .github/workflows/orbit.yml in your repository
# Configure ORBIT_API_KEY and ORBIT_PROJECT_ID as GitHub secrets

name: Orbit Tests

on:
  push:
    branches: [${branchList}]
  pull_request:
    branches: [${branchList}]

jobs:
  orbit-tests:
    name: Run Orbit Tests
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Trigger Orbit Test Run
        id: trigger
        env:
          ORBIT_API_KEY: \${{ secrets.ORBIT_API_KEY }}
          ORBIT_PROJECT_ID: \${{ secrets.ORBIT_PROJECT_ID }}
        run: |
          RESPONSE=$(curl -s -w "\\n%{http_code}" \\
            -X POST "https://api.orbitesting.com/v1/projects/\${ORBIT_PROJECT_ID}/runs" \\
            -H "Authorization: Bearer \${ORBIT_API_KEY}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "mode": "${merged.mode}",
              "environment": "${merged.environment}",
              "branch": "'\${{ github.head_ref || github.ref_name }}'",
              "commitSha": "'\${{ github.sha }}'",
              "prNumber": '\${{ github.event.pull_request.number || 0 }}'
            }')

          HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
          BODY=$(echo "$RESPONSE" | head -n-1)

          if [ "$HTTP_CODE" -ge 400 ]; then
            echo "::error::Orbit API returned HTTP $HTTP_CODE"
            echo "$BODY"
            exit 1
          fi

          RUN_ID=$(echo "$BODY" | jq -r '.data.id // .id // empty')
          echo "run_id=$RUN_ID" >> "$GITHUB_OUTPUT"
          echo "Orbit run started: $RUN_ID"

      - name: Wait for Orbit Results
        id: results
        env:
          ORBIT_API_KEY: \${{ secrets.ORBIT_API_KEY }}
          ORBIT_PROJECT_ID: \${{ secrets.ORBIT_PROJECT_ID }}
        run: |
          RUN_ID="\${{ steps.trigger.outputs.run_id }}"
          if [ -z "$RUN_ID" ]; then
            echo "::error::No run ID received"
            exit 1
          fi

          echo "Waiting for Orbit run $RUN_ID to complete..."

          for i in $(seq 1 60); do
            RESPONSE=$(curl -s \\
              "https://api.orbitesting.com/v1/projects/\${ORBIT_PROJECT_ID}/runs/\${RUN_ID}" \\
              -H "Authorization: Bearer \${ORBIT_API_KEY}")

            STATUS=$(echo "$RESPONSE" | jq -r '.data.status // .status // "unknown"')

            case "$STATUS" in
              completed)
                echo "Run completed successfully"
                PASSED=$(echo "$RESPONSE" | jq -r '.data.passed // .passed // 0')
                FAILED=$(echo "$RESPONSE" | jq -r '.data.failed // .failed // 0')
                TOTAL=$(echo "$RESPONSE" | jq -r '.data.totalTests // .totalTests // 0')
                echo "passed=$PASSED" >> "$GITHUB_OUTPUT"
                echo "failed=$FAILED" >> "$GITHUB_OUTPUT"
                echo "total=$TOTAL" >> "$GITHUB_OUTPUT"
                echo "### Orbit Test Results" >> "$GITHUB_STEP_SUMMARY"
                echo "| Metric | Value |" >> "$GITHUB_STEP_SUMMARY"
                echo "| ------ | ----- |" >> "$GITHUB_STEP_SUMMARY"
                echo "| Total  | $TOTAL |" >> "$GITHUB_STEP_SUMMARY"
                echo "| Passed | $PASSED |" >> "$GITHUB_STEP_SUMMARY"
                echo "| Failed | $FAILED |" >> "$GITHUB_STEP_SUMMARY"
                break
                ;;
              failed|cancelled)
                echo "::error::Orbit run $STATUS"
                exit 1
                ;;
              *)
                echo "Status: $STATUS (attempt $i/60)"
                sleep 15
                ;;
            esac
          done

          if [ "$STATUS" != "completed" ]; then
            echo "::error::Timed out waiting for Orbit run"
            exit 1
          fi

      - name: Check Results
        if: ${merged.failOnFailure ? "always()" : "false"}
        run: |
          FAILED="\${{ steps.results.outputs.failed }}"
          if [ "$FAILED" -gt 0 ]; then
            echo "::error::$FAILED test(s) failed"
            exit 1
          fi
`;
}

export function generateOrbitConfigTemplate(): string {
  return `import { defineConfig } from '@orbit-hq/sdk';

export default defineConfig({
  scope: {
    include: ['app/**', 'src/**'],
    exclude: ['app/admin/**', 'src/internal/**'],
    critical: ['/checkout', '/api/payments', '/login'],
  },
  coverage: {
    target: 80,
    criticalTarget: 100,
  },
  execution: {
    mode: 'hybrid',
    flakinessTolerance: 2,
  },
});
`;
}

export { DEFAULT_CONFIG };
export type { WorkflowConfig };
