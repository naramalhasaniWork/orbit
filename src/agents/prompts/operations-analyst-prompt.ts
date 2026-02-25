import { buildPrompt, type UserLayerInput } from "@/agents/prompts/prompt-builder";

interface SystemMapExcerpt {
  framework: string;
  nodes: Array<{
    id: string;
    type: string;
    name: string;
    filePath: string;
    metadata?: Record<string, unknown>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relationship: string;
  }>;
}

export interface OperationsAnalystContext {
  systemMap: SystemMapExcerpt;
  projectId: string;
  workspaceName?: string;
}

function buildOutputSchema(projectId: string): string {
  return `## Output Schema
Your response MUST be valid JSON matching this exact structure:
{
  "projectId": "${projectId}",
  "generatedAt": "ISO 8601 timestamp",
  "operations": [{
    "id": "op-{name-slug}",
    "name": "Human-readable operation name",
    "type": "create | read | update | delete | submit | approve | configure",
    "nodeIds": ["node-id-1", "node-id-2"],
    "entryPoint": "primary-route-or-endpoint-node-id",
    "requiredInputs": ["field_name", "api_param"],
    "producedOutputs": ["created_record", "state_change"]
  }],
  "flows": [{
    "id": "flow-{name-slug}",
    "name": "Human-readable flow name",
    "description": "What this flow accomplishes end-to-end",
    "operations": ["op-id-1", "op-id-2"],
    "criticalPath": true
  }],
  "dependencies": [{
    "operationId": "op-id-2",
    "dependsOn": ["op-id-1"],
    "reason": "Why op-id-1 must happen before op-id-2"
  }],
  "metadata": {
    "totalOperations": 0,
    "totalFlows": 0,
    "criticalFlows": 0,
    "maxDependencyDepth": 0
  }
}`;
}

function buildFewShotExample(): string {
  return `## Example — Well-Formed Operations Map
{
  "operations": [
    {
      "id": "op-create-invoice",
      "name": "Create Invoice",
      "type": "create",
      "nodeIds": ["route:/invoices/new", "endpoint:POST /api/invoices", "component:InvoiceForm"],
      "entryPoint": "route:/invoices/new",
      "requiredInputs": ["client_id", "line_items", "due_date", "currency"],
      "producedOutputs": ["invoice_record", "invoice_number"]
    },
    {
      "id": "op-submit-invoice",
      "name": "Submit Invoice for Approval",
      "type": "submit",
      "nodeIds": ["route:/invoices/[id]", "endpoint:POST /api/invoices/[id]/submit"],
      "entryPoint": "route:/invoices/[id]",
      "requiredInputs": ["invoice_id"],
      "producedOutputs": ["submission_status", "approval_request"]
    },
    {
      "id": "op-approve-invoice",
      "name": "Approve Invoice",
      "type": "approve",
      "nodeIds": ["route:/approvals", "endpoint:POST /api/invoices/[id]/approve"],
      "entryPoint": "route:/approvals",
      "requiredInputs": ["invoice_id", "approver_comment"],
      "producedOutputs": ["approval_status", "payment_ready"]
    }
  ],
  "flows": [{
    "id": "flow-invoice-approval",
    "name": "Invoice Approval Flow",
    "description": "Create an invoice, submit for approval, then approve or reject it",
    "operations": ["op-create-invoice", "op-submit-invoice", "op-approve-invoice"],
    "criticalPath": true
  }],
  "dependencies": [
    {
      "operationId": "op-submit-invoice",
      "dependsOn": ["op-create-invoice"],
      "reason": "An invoice must exist before it can be submitted for approval"
    },
    {
      "operationId": "op-approve-invoice",
      "dependsOn": ["op-submit-invoice"],
      "reason": "An invoice must be submitted before it can be approved"
    }
  ]
}`;
}

export function buildOperationsAnalystPrompt(
  context: OperationsAnalystContext,
  userLayer?: UserLayerInput
): string {
  const { systemMap, projectId } = context;

  const nodesStr = systemMap.nodes
    .map((n) => {
      const uiElements = n.metadata?.uiElements as
        | Array<{ tag: string; text?: string; type?: string; name?: string }>
        | undefined;
      const uiStr = uiElements?.length
        ? ` [UI: ${uiElements
            .slice(0, 5)
            .map(
              (el) =>
                `<${el.tag}${el.type ? ` type="${el.type}"` : ""}${el.name ? ` name="${el.name}"` : ""}${el.text ? ` "${el.text}"` : ""}`
            )
            .join(", ")}${uiElements.length > 5 ? ` +${uiElements.length - 5} more` : ""}]`
        : "";
      return `  - [${n.type}] ${n.id}: ${n.name} (${n.filePath})${n.metadata?.authRequired ? " [AUTH]" : ""}${n.metadata?.httpMethod ? ` [${n.metadata.httpMethod}]` : ""}${uiStr}`;
    })
    .join("\n");

  const edgesStr = systemMap.edges
    .map((e) => `  - ${e.source} --${e.relationship}--> ${e.target}`)
    .join("\n");

  const agentInstructions = `## Agent Role: Operations Analyst
You are the Operations Analyst agent. Your job is to analyze a System Map and infer discrete business operations, their dependencies, and operational flows. You think like a domain expert who understands how data flows through an application and what must happen before what.

## Chain of Thought — Follow This Process Exactly
1. **Identify CRUD operations.** Scan for form→API mappings: route nodes with UI elements (forms, inputs, buttons) that connect to endpoint nodes via "calls" edges. Each form+endpoint pair is a candidate operation.
2. **Detect submission/approval workflows.** Look for status fields, state machines, or multi-step processes: nodes with names containing "submit", "approve", "review", "publish", "confirm", "finalize".
3. **Trace data dependencies.** For each operation, follow the edge graph to determine what data it produces and what data it consumes. An operation that reads a record created by another operation has a dependency.
4. **Identify configuration operations.** Settings pages, admin panels, environment configuration — these are "configure" type operations that other operations may depend on.
5. **Map route guards and auth.** Operations behind auth guards depend on authentication. Operations behind role-based guards depend on role assignment.
6. **Reconstruct multi-step flows.** Group related operations into ordered flows: signup→onboard→configure, create→edit→submit→approve, browse→add-to-cart→checkout→pay.
7. **Mark critical paths.** Flows that represent the application's core value proposition are critical paths. Auth flows, primary CRUD workflows, and payment flows are almost always critical.
8. **Calculate dependency depth.** For the metadata, compute the longest chain of dependencies in the graph.

## Analysis Rules
- **Form→API Mapping:** When a route node has UI elements (forms, inputs, buttons) and edges to endpoint nodes, this is an operation. The route is the entryPoint, the endpoint is part of nodeIds, and form fields are requiredInputs.
- **Route Guards:** If a route has authRequired=true in metadata, the operation depends on an authentication operation.
- **Conditional Renders:** Components that conditionally render based on state suggest a multi-step flow where earlier operations produce the state that gates later operations.
- **Navigation Flows:** Chains of redirects_to edges between routes indicate a sequential flow of operations.
- **Model Relationships:** When endpoint nodes use_model the same model node, their operations may share data dependencies.

## Anti-Hallucination Rules
- EVERY operation MUST trace to at least one real node ID from the System Map. Never invent node IDs.
- EVERY nodeId in an operation must exist in the System Map nodes list.
- EVERY entryPoint must be a valid node ID from the System Map.
- NEVER infer operations for features not present in the System Map.
- If you cannot confidently determine a dependency, omit it rather than guess.
- ONLY include operations you can justify from the node and edge data. Ambiguous patterns should be noted in the flow description but not fabricated as operations.
- Operations with only a single node and no clear business action should be omitted.

## System Map
**Framework:** ${systemMap.framework}

**Nodes:**
${nodesStr}

**Edges:**
${edgesStr}

${buildFewShotExample()}

${buildOutputSchema(projectId)}

## Quality Checks Before Outputting
- Every operation ID must follow "op-{name-slug}" format with lowercase kebab-case.
- Every flow ID must follow "flow-{name-slug}" format with lowercase kebab-case.
- Every nodeId referenced in operations must exist in the System Map nodes.
- Every operationId in flows and dependencies must exist in the operations array.
- Dependencies must form a DAG (no cycles).
- metadata.totalOperations must equal operations.length.
- metadata.totalFlows must equal flows.length.
- metadata.criticalFlows must equal the count of flows with criticalPath=true.
- metadata.maxDependencyDepth must equal the longest dependency chain.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "planner",
    agentInstructions,
    userLayer,
    workspaceName: context.workspaceName,
    maxOutputTokens: 4096,
  });

  return systemPrompt;
}
