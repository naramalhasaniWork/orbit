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

function buildFrameworkHeuristics(meta: FrameworkMetadata): string {
  const heuristics: string[] = [];

  if (meta.name.toLowerCase().includes("next")) {
    heuristics.push(`### Next.js Heuristics
- **App Router vs Pages Router:** Check for \`app/\` directory (App Router) vs \`pages/\` directory (Pages Router). ${meta.router === "app" ? "This project uses App Router." : meta.router === "pages" ? "This project uses Pages Router." : "Detect from directory structure."}
- **Server Components:** Files in \`app/\` without \`"use client"\` are Server Components. Mark them as \`serverComponent: true\` in metadata.
- **API Routes:** In App Router, look for \`app/api/**/route.ts\` files exporting GET/POST/PUT/DELETE/PATCH handlers. In Pages Router, look for \`pages/api/**/*.ts\`.
- **Layouts:** Files named \`layout.tsx\` define shared layouts. Mark relationship as \`wraps\`.
- **Middleware:** \`middleware.ts\` at project root applies to all routes. Detect route matchers in its config.
- **Loading/Error States:** \`loading.tsx\`, \`error.tsx\`, \`not-found.tsx\` are special route segments.
- **Route Groups:** Directories in parentheses like \`(dashboard)\` are route groups — they affect layout nesting but NOT the URL path.
- **Dynamic Routes:** \`[param]\` segments are dynamic, \`[...slug]\` is catch-all, \`[[...slug]]\` is optional catch-all.`);
  }

  if (meta.name.toLowerCase().includes("react") || meta.features.includes("react")) {
    heuristics.push(`### React Heuristics
- **Hook Patterns:** Detect custom hooks (\`use*\` functions). Mark as type \`hook\` with edges to components that import them.
- **State Management:** Look for Redux (\`createSlice\`, \`configureStore\`), Zustand (\`create\`), Jotai (\`atom\`), or React Query (\`useQuery\`). Mark as \`state_manager\` type.
- **Context Providers:** Detect \`createContext\` and provider components. Mark edges as \`provides_context\`.
- **Component Composition:** Track which components render which others via JSX. Mark edges as \`renders\`.`);
  }

  if (heuristics.length === 0) {
    heuristics.push(`### General Framework Heuristics
- Identify the routing mechanism and map file paths to URL routes.
- Detect middleware and auth guard patterns.
- Identify data models from ORM definitions, type declarations, or schema files.`);
  }

  return heuristics.join("\n\n");
}

function buildOutputSchema(projectId: string): string {
  return `## Output Schema
Your response MUST be valid JSON matching this exact structure:
{
  "projectId": "${projectId}",
  "framework": "string",
  "language": "string",
  "nodes": [{
    "id": "string (unique, pattern: {type}:{identifier})",
    "type": "route | component | endpoint | model | auth_strategy | middleware | hook | layout | state_manager",
    "name": "string (human-readable)",
    "filePath": "string (relative path)",
    "metadata": {
      "httpMethod": "string (GET/POST/PUT/DELETE/PATCH, for endpoints only)",
      "params": ["string (route params like [id], query params)"],
      "authRequired": "boolean",
      "framework": "string",
      "serverComponent": "boolean (for Next.js/React Server Components)",
      "exports": ["string"],
      "dependencies": ["string"],
      "description": "string (one-line purpose)",
      "confidence": "number 0-100 (how confident you are in this classification)"
    },
    "edges": [{
      "target": "string (target node id)",
      "relationship": "imports | renders | calls | protects | uses_model | redirects_to | middleware_for | wraps | provides_context"
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
}`;
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

  const frameworkHeuristics = buildFrameworkHeuristics(frameworkMetadata);

  const agentInstructions = `## Agent Role: Analyst
You are the Analyst agent. Your job is to analyze source code, AST parse results, and framework metadata to produce a **System Map** — a directed graph representing the application's structure.

## Chain of Thought — Follow This Process Exactly
Before generating the System Map, analyze systematically:
1. **Identify the framework and routing model.** Use the detected framework metadata AND the actual file structure to confirm. Do not trust metadata alone — verify against the code.
2. **Map all routes.** Trace every route from its file path to its URL. For each route, determine: is it public or protected? What HTTP methods does it handle? What params does it accept?
3. **Map all API endpoints.** For each endpoint: HTTP method, request/response shape, auth requirements, and which models it touches.
4. **Map all components.** For each component: what does it render? What hooks does it use? Is it a server component or client component?
5. **Map auth strategy.** How does the app authenticate users? JWT? Sessions? OAuth? API keys? Where are auth guards applied?
6. **Build the dependency graph.** Trace imports to build edges. Every import = an edge. Every render = an edge. Every API call = an edge.
7. **Validate completeness.** Cross-check: does every file in the AST results have at least one node? Are there orphan nodes with no edges? If so, investigate.

## Anti-Hallucination Rules
- NEVER invent routes, endpoints, components, or models that do not exist in the provided code.
- If a file is ambiguous (e.g., could be a utility or a component), classify based on what you can verify. Add a confidence score < 80 to flag uncertainty.
- If the AST results and source code disagree (e.g., AST shows an export that is not in the code), trust the source code.
- Every node ID must correspond to an actual entity in the code files. Cross-reference before adding.

## Framework Detected
- **Name:** ${frameworkMetadata.name}
- **Version:** ${frameworkMetadata.version}
- **Router:** ${frameworkMetadata.router}
- **Language:** ${frameworkMetadata.language}
- **Features:** ${frameworkMetadata.features.join(", ")}

${frameworkHeuristics}

## AST Analysis Results
${astSummary}

## Source Files
${filesSummary}

${buildOutputSchema(projectId)}

## Rules
- Every node must have a unique ID following the "{type}:{identifier}" pattern.
- Every edge must reference valid source and target node IDs that exist in the nodes array.
- Do not invent routes or endpoints that don't exist in the code. If uncertain, omit and explain in a comment field.
- If uncertain about a node's type, prefer the more specific type and lower the confidence score.
- Include ALL routes and endpoints, even if they seem trivial (health checks, 404 pages, etc.).
- For Next.js App Router, derive routes from the file path structure (app/dashboard/page.tsx -> route:/dashboard).
- For API routes, include the HTTP method in the endpoint ID (endpoint:POST:/api/users).
- Detect and classify auth strategies: JWT, session-cookie, OAuth, API key, Clerk, NextAuth, Auth0, Supabase Auth.
- Mark middleware that protects routes with authRequired: true on the route node.
- Assign confidence >= 90 only when the classification is unambiguous from the code.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "analyst",
    agentInstructions,
    userLayer,
    workspaceName: context.workspaceName,
  });

  return systemPrompt;
}
