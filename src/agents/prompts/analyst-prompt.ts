import { buildPrompt, type UserLayerInput } from "@/agents/prompts/prompt-builder";

interface ASTResult {
  filePath: string;
  exports: string[];
  imports: string[];
  functions: string[];
  classes: string[];
  components: string[];
}

interface FrameworkMetadata {
  name: string;
  version: string;
  router: string;
  language: string;
  features: string[];
}

export interface AnalystContext {
  codeFiles: Array<{
    path: string;
    content: string;
  }>;
  astResults: ASTResult[];
  frameworkMetadata: FrameworkMetadata;
  projectId: string;
  workspaceName?: string;
}

export function buildAnalystPrompt(
  context: AnalystContext,
  userLayer?: UserLayerInput
): string {
  const { codeFiles, astResults, frameworkMetadata, projectId } = context;

  const filesSummary = codeFiles
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");

  const astSummary = astResults
    .map(
      (a) =>
        `- **${a.filePath}**: exports=[${a.exports.join(", ")}], imports=[${a.imports.join(", ")}], functions=[${a.functions.join(", ")}], components=[${a.components.join(", ")}]`
    )
    .join("\n");

  const agentInstructions = `## Agent Role: Analyst
You are the Analyst agent. Your job is to analyze source code, AST parse results, and framework metadata to produce a **System Map** — a directed graph representing the application's structure.

## Your Task
1. Identify all routes, components, API endpoints, data models, auth strategies, and middleware.
2. Determine the relationships between them (imports, renders, calls, protects, etc.).
3. Classify each node with the correct type.
4. Assign meaningful IDs using the pattern: "{type}:{identifier}" (e.g. "route:/login", "endpoint:POST:/api/users", "component:LoginForm", "model:User", "auth:jwt", "middleware:rateLimiter").
5. Note which routes require authentication and what auth strategy they use.
6. Capture key metadata for each node — especially HTTP methods, params, and dependencies.
7. Build edges that trace the full request lifecycle: middleware -> route -> component -> API call -> model.

## Framework Detected
- **Name:** ${frameworkMetadata.name}
- **Version:** ${frameworkMetadata.version}
- **Router:** ${frameworkMetadata.router}
- **Language:** ${frameworkMetadata.language}
- **Features:** ${frameworkMetadata.features.join(", ")}

## AST Analysis Results
${astSummary}

## Source Files
${filesSummary}

## Output Schema
Your response MUST be valid JSON matching this exact structure:
{
  "projectId": "${projectId}",
  "framework": "string",
  "language": "string",
  "nodes": [{
    "id": "string (unique, pattern: {type}:{identifier})",
    "type": "route | component | endpoint | model | auth_strategy | middleware",
    "name": "string (human-readable)",
    "filePath": "string (relative path)",
    "metadata": {
      "httpMethod": "string (GET/POST/PUT/DELETE/PATCH, for endpoints)",
      "params": ["string (route params like [id], query params)"],
      "authRequired": "boolean",
      "framework": "string",
      "exports": ["string"],
      "dependencies": ["string"],
      "description": "string (one-line purpose)"
    },
    "edges": [{
      "target": "string (target node id)",
      "relationship": "imports | renders | calls | protects | uses_model | redirects_to | middleware_for"
    }]
  }],
  "edges": [{
    "source": "string",
    "target": "string",
    "relationship": "string"
  }],
  "summary": {
    "totalRoutes": "number",
    "totalComponents": "number",
    "totalEndpoints": "number",
    "totalModels": "number",
    "authStrategies": ["string"],
    "frameworks": ["string"]
  }
}

## Rules
- Every node must have a unique ID following the "{type}:{identifier}" pattern.
- Every edge must reference valid source and target node IDs.
- Do not invent routes or endpoints that don't exist in the code.
- If uncertain about a node's type, prefer the more specific type.
- Include ALL routes and endpoints, even if they seem trivial.
- For Next.js App Router, derive routes from the file path structure (app/dashboard/page.tsx -> route:/dashboard).
- For API routes, include the HTTP method in the endpoint ID (endpoint:POST:/api/users).
- Detect and classify auth strategies: JWT, session, OAuth, API key, etc.
- Mark middleware that protects routes with authRequired: true on the route node.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "analyst",
    agentInstructions,
    userLayer,
    workspaceName: context.workspaceName,
  });

  return systemPrompt;
}
