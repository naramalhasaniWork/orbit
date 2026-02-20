import { getOperatorPrompt } from "@/agents/prompts/operator-layer";

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
}

const OUTPUT_SCHEMA = `{
  "projectId": "string",
  "framework": "string (e.g. 'next', 'react', 'express')",
  "language": "string (e.g. 'typescript', 'javascript')",
  "nodes": [
    {
      "id": "string (unique, e.g. 'route:/dashboard')",
      "type": "route | component | endpoint | model | auth_strategy | middleware",
      "name": "string (human-readable name)",
      "filePath": "string (relative file path)",
      "metadata": {
        "httpMethod": "string (optional, for endpoints)",
        "params": ["string (optional, route/query params)"],
        "authRequired": "boolean (optional)",
        "framework": "string (optional)",
        "exports": ["string (optional)"],
        "dependencies": ["string (optional)"],
        "description": "string (optional, brief purpose)"
      },
      "edges": [
        {
          "target": "string (target node id)",
          "relationship": "imports | renders | calls | protects | uses_model | redirects_to | middleware_for"
        }
      ]
    }
  ],
  "edges": [
    {
      "source": "string (source node id)",
      "target": "string (target node id)",
      "relationship": "string"
    }
  ],
  "summary": {
    "totalRoutes": "number",
    "totalComponents": "number",
    "totalEndpoints": "number",
    "totalModels": "number",
    "authStrategies": ["string"],
    "frameworks": ["string"]
  }
}`;

export function buildAnalystPrompt(
  context: AnalystContext,
  userContext?: string
): string {
  const { codeFiles, astResults, frameworkMetadata, projectId } = context;

  const operatorPrompt = getOperatorPrompt();

  const filesSummary = codeFiles
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");

  const astSummary = astResults
    .map(
      (a) =>
        `- **${a.filePath}**: exports=[${a.exports.join(", ")}], imports=[${a.imports.join(", ")}], functions=[${a.functions.join(", ")}], components=[${a.components.join(", ")}]`
    )
    .join("\n");

  return `${operatorPrompt}

## Agent Role: Analyst
You are the Analyst agent. Your job is to analyze source code, AST parse results, and framework metadata to produce a **System Map** — a directed graph representing the application's structure.

## Your Task
1. Identify all routes, components, API endpoints, data models, auth strategies, and middleware.
2. Determine the relationships between them (imports, renders, calls, protects, etc.).
3. Classify each node with the correct type.
4. Assign meaningful IDs (e.g. "route:/login", "endpoint:POST:/api/users", "component:LoginForm").
5. Note which routes require authentication.
6. Capture key metadata for each node.

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
Your response MUST be valid JSON matching this exact schema:
${OUTPUT_SCHEMA}

Use projectId: "${projectId}"

## Rules
- Every node must have a unique ID.
- Every edge must reference valid source and target node IDs.
- Do not invent routes or endpoints that don't exist in the code.
- If uncertain about a node's type, prefer the more specific type.
- Include ALL routes and endpoints, even if they seem trivial.
- For Next.js App Router, derive routes from the file path structure.${userContext ? `

## User-Provided Context
${userContext}` : ""}`;
}
