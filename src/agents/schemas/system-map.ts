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

export const SystemMapNodeSchema = z.object({
  id: z.string().describe("Unique identifier for the node"),
  type: z.enum([
    "route",
    "component",
    "endpoint",
    "model",
    "auth_strategy",
    "middleware",
  ]),
  name: z.string().describe("Human-readable name"),
  filePath: z.string().describe("Relative path to the source file"),
  metadata: z
    .object({
      httpMethod: z.string().optional(),
      params: z.array(z.string()).optional(),
      authRequired: z.boolean().optional(),
      framework: z.string().optional(),
      exports: z.array(z.string()).optional(),
      dependencies: z.array(z.string()).optional(),
      description: z.string().optional(),
    })
    .passthrough()
    .optional(),
  edges: z
    .array(
      z.object({
        target: z.string(),
        relationship: z.string(),
      })
    )
    .default([]),
});

export const SystemMapEdgeSchema = z.object({
  source: z.string().describe("Source node ID"),
  target: z.string().describe("Target node ID"),
  relationship: z.string().describe("Type of relationship between nodes"),
});

export const SystemMapSchema = z.object({
  projectId: z.string(),
  framework: z.string().describe("Detected framework (e.g. next, react, express)"),
  language: z.string().describe("Primary language"),
  nodes: z.array(SystemMapNodeSchema),
  edges: z.array(SystemMapEdgeSchema),
  summary: z.object({
    totalRoutes: z.number(),
    totalComponents: z.number(),
    totalEndpoints: z.number(),
    totalModels: z.number(),
    authStrategies: z.array(z.string()),
    frameworks: z.array(z.string()),
  }),
});

export type SystemMapNode = z.infer<typeof SystemMapNodeSchema>;
export type SystemMapEdge = z.infer<typeof SystemMapEdgeSchema>;
export type SystemMap = z.infer<typeof SystemMapSchema>;
