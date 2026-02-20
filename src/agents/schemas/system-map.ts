import { z } from "zod";

export const SYSTEM_MAP_NODE_TYPES = {
  route: "route",
  component: "component",
  endpoint: "endpoint",
  model: "model",
  auth_strategy: "auth_strategy",
  middleware: "middleware",
} as const;

export const SYSTEM_MAP_RELATIONSHIPS = {
  imports: "imports",
  renders: "renders",
  calls: "calls",
  protects: "protects",
  uses_model: "uses_model",
  redirects_to: "redirects_to",
  middleware_for: "middleware_for",
} as const;

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

const NodeTypeEnum = z.enum([
  "route",
  "component",
  "endpoint",
  "model",
  "auth_strategy",
  "middleware",
]);

const RelationshipEnum = z.enum([
  "imports",
  "renders",
  "calls",
  "protects",
  "uses_model",
  "redirects_to",
  "middleware_for",
]);

export const SystemMapNodeSchema = z.object({
  id: z.string()
    .min(1)
    .describe("Unique identifier following {type}:{identifier} pattern"),
  type: NodeTypeEnum,
  name: z.string().min(1).describe("Human-readable name"),
  filePath: z.string().min(1).describe("Relative path to the source file"),
  metadata: z
    .object({
      httpMethod: z.enum(HTTP_METHODS).optional(),
      params: z.array(z.string()).optional(),
      authRequired: z.boolean().optional(),
      authStrategy: z.string().optional().describe("Auth type: jwt, session, oauth, api_key"),
      framework: z.string().optional(),
      exports: z.array(z.string()).optional(),
      dependencies: z.array(z.string()).optional(),
      description: z.string().optional(),
      responseSchema: z.string().optional().describe("Response type name if detected"),
      validationSchema: z.string().optional().describe("Zod/Yup schema name if detected"),
      isInteractive: z.boolean().optional().describe("For components: has user-interactive elements"),
    })
    .passthrough()
    .optional(),
  edges: z
    .array(
      z.object({
        target: z.string().min(1),
        relationship: RelationshipEnum,
      })
    )
    .default([]),
});

export const SystemMapEdgeSchema = z.object({
  source: z.string().min(1).describe("Source node ID"),
  target: z.string().min(1).describe("Target node ID"),
  relationship: RelationshipEnum.describe("Type of relationship between nodes"),
});

export const SystemMapSchema = z.object({
  projectId: z.string(),
  framework: z.string().min(1).describe("Detected framework (e.g. next, react, express)"),
  language: z.string().min(1).describe("Primary language"),
  nodes: z.array(SystemMapNodeSchema).min(1),
  edges: z.array(SystemMapEdgeSchema),
  summary: z.object({
    totalRoutes: z.number().int().min(0),
    totalComponents: z.number().int().min(0),
    totalEndpoints: z.number().int().min(0),
    totalModels: z.number().int().min(0),
    authStrategies: z.array(z.string()),
    frameworks: z.array(z.string()).min(1),
  }),
});

export type SystemMapNode = z.infer<typeof SystemMapNodeSchema>;
export type SystemMapEdge = z.infer<typeof SystemMapEdgeSchema>;
export type SystemMap = z.infer<typeof SystemMapSchema>;
