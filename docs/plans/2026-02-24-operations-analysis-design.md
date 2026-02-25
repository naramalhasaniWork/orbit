# Operations Analysis & Flow Testing Design

## Problem

Orbit's journey reconstruction is purely structural — keyword matching + DFS graph walking. It doesn't understand that business operations have prerequisites and dependencies (e.g., "fill daily log" before "submit for approval"). Test scripts get generated without understanding operational flow ordering.

## Solution: Operations Analyzer Agent

A new agent phase that runs **after indexing, before planning**. It examines the system map (nodes, edges, metadata — forms, API endpoints, auth guards, state transitions) and infers a **dependency graph of business operations**.

### Pipeline Change

```
Indexing → [NEW: Operations Analysis] → Planning → Execution → Reporting
```

### Operations Model

```typescript
interface OperationsMap {
  operations: Operation[];        // Discrete business operations
  flows: OperationalFlow[];       // Multi-step flows with ordering
  dependencies: FlowDependency[]; // Prerequisites between operations
}

interface Operation {
  id: string;
  name: string;                   // "Create Invoice", "Submit Daily Log"
  type: "create" | "read" | "update" | "delete" | "submit" | "approve" | "configure";
  nodeIds: string[];              // System map nodes involved
  entryPoint: string;             // Primary route/endpoint
  requiredInputs: string[];       // Form fields, API params needed
  producedOutputs: string[];      // Data/state this operation creates
}

interface OperationalFlow {
  id: string;
  name: string;                   // "Daily Log Approval Flow"
  description: string;
  operations: string[];           // Ordered operation IDs
  criticalPath: boolean;          // Business-critical flow
}

interface FlowDependency {
  operationId: string;            // This operation...
  dependsOn: string[];            // ...requires these to complete first
  reason: string;                 // "Invoice requires line items"
}
```

### How It Infers Dependencies

1. **Form → API mapping**: Form submissions → POST/PUT endpoints → what data they create
2. **Route guards**: Protected routes imply auth prerequisite
3. **Conditional renders**: UI that only appears after state changes
4. **API response → UI binding**: Data created by one operation consumed by another
5. **Navigation flow**: Route transitions imply ordering

### Test Types Added

- `operational_flow` — Tests a complete multi-step business flow end-to-end
- `prerequisite_chain` — Tests that prerequisites are enforced (can't approve without filling)

## Agent Team

| Agent | Responsibility |
|-------|---------------|
| **Architecture** | Operations Analyzer service, schemas, prompt, pipeline integration, planner enhancement |
| **Flow Testing** | New test types, flow-aware generation, prerequisite execution, journey reconstructor enhancement |
| **QA** | Fix broken tests, validate new functionality, harden error handling |
| **UX** | Fix workspace switcher, commit pending changes, operations visualization, UI gap fixes |
