import { subDays, subMinutes } from "date-fns";

const now = new Date();

// ============================================================
// STABLE IDS (for idempotent upserts)
// ============================================================

export const IDS = {
  workspace: "a0000000-0000-4000-8000-000000000001",
  users: {
    admin: "b0000000-0000-4000-8000-000000000001",
    member: "b0000000-0000-4000-8000-000000000002",
    viewer: "b0000000-0000-4000-8000-000000000003",
  },
  members: {
    admin: "c0000000-0000-4000-8000-000000000001",
    member: "c0000000-0000-4000-8000-000000000002",
    viewer: "c0000000-0000-4000-8000-000000000003",
  },
  project: "d0000000-0000-4000-8000-000000000001",
  environments: {
    staging: "e0000000-0000-4000-8000-000000000001",
    preview: "e0000000-0000-4000-8000-000000000002",
    qa: "e0000000-0000-4000-8000-000000000003",
  },
  testPlan: "f0000000-0000-4000-8000-000000000001",
  runs: [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003",
    "10000000-0000-4000-8000-000000000004",
    "10000000-0000-4000-8000-000000000005",
  ],
} as const;

// ============================================================
// SYSTEM MAP NODES — 45 nodes
// ============================================================

export interface NodeDef {
  id: string;
  type: "route" | "component" | "endpoint" | "model" | "auth_strategy" | "middleware";
  name: string;
  filePath: string;
  metadata: Record<string, unknown>;
}

function nodeId(i: number): string {
  return `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
}

function pickTestStatus(i: number): string {
  const b = i % 20;
  if (b < 12) return "pass";
  if (b < 15) return "fail";
  if (b < 17) return "flaky";
  return "untested";
}

export const NODES: NodeDef[] = [
  { id: nodeId(1), type: "route", name: "/", filePath: "src/app/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(1) } },
  { id: nodeId(2), type: "route", name: "/dashboard", filePath: "src/app/dashboard/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(2) } },
  { id: nodeId(3), type: "route", name: "/login", filePath: "src/app/login/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(3) } },
  { id: nodeId(4), type: "route", name: "/register", filePath: "src/app/register/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(4) } },
  { id: nodeId(5), type: "route", name: "/settings", filePath: "src/app/settings/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(5) } },
  { id: nodeId(6), type: "route", name: "/profile", filePath: "src/app/profile/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(6) } },
  { id: nodeId(7), type: "route", name: "/checkout", filePath: "src/app/checkout/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(7) } },
  { id: nodeId(8), type: "route", name: "/products", filePath: "src/app/products/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(8) } },
  { id: nodeId(9), type: "route", name: "/products/[id]", filePath: "src/app/products/[id]/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(9) } },
  { id: nodeId(10), type: "route", name: "/cart", filePath: "src/app/cart/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(10) } },
  { id: nodeId(11), type: "route", name: "/orders", filePath: "src/app/orders/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(11) } },
  { id: nodeId(12), type: "route", name: "/admin", filePath: "src/app/admin/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(12) } },
  { id: nodeId(13), type: "route", name: "/notifications", filePath: "src/app/notifications/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(13) } },
  { id: nodeId(14), type: "route", name: "/search", filePath: "src/app/search/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(14) } },
  { id: nodeId(15), type: "route", name: "/onboarding", filePath: "src/app/onboarding/page.tsx", metadata: { method: "GET", testStatus: pickTestStatus(15) } },
  // Endpoints (9)
  { id: nodeId(16), type: "endpoint", name: "/api/users", filePath: "src/app/api/users/route.ts", metadata: { method: "GET", testStatus: pickTestStatus(16) } },
  { id: nodeId(17), type: "endpoint", name: "/api/products", filePath: "src/app/api/products/route.ts", metadata: { method: "GET", testStatus: pickTestStatus(17) } },
  { id: nodeId(18), type: "endpoint", name: "/api/orders", filePath: "src/app/api/orders/route.ts", metadata: { method: "POST", testStatus: pickTestStatus(18) } },
  { id: nodeId(19), type: "endpoint", name: "/api/auth/login", filePath: "src/app/api/auth/login/route.ts", metadata: { method: "POST", testStatus: pickTestStatus(19) } },
  { id: nodeId(20), type: "endpoint", name: "/api/auth/register", filePath: "src/app/api/auth/register/route.ts", metadata: { method: "POST", testStatus: pickTestStatus(20) } },
  { id: nodeId(21), type: "endpoint", name: "/api/payments", filePath: "src/app/api/payments/route.ts", metadata: { method: "POST", testStatus: pickTestStatus(21) } },
  { id: nodeId(22), type: "endpoint", name: "/api/cart", filePath: "src/app/api/cart/route.ts", metadata: { method: "GET", testStatus: pickTestStatus(22) } },
  { id: nodeId(23), type: "endpoint", name: "/api/search", filePath: "src/app/api/search/route.ts", metadata: { method: "GET", testStatus: pickTestStatus(23) } },
  { id: nodeId(24), type: "endpoint", name: "/api/notifications", filePath: "src/app/api/notifications/route.ts", metadata: { method: "GET", testStatus: pickTestStatus(24) } },
  // Components (12)
  { id: nodeId(25), type: "component", name: "Header", filePath: "src/components/header.tsx", metadata: { testStatus: pickTestStatus(25) } },
  { id: nodeId(26), type: "component", name: "Sidebar", filePath: "src/components/sidebar.tsx", metadata: { testStatus: pickTestStatus(26) } },
  { id: nodeId(27), type: "component", name: "ProductCard", filePath: "src/components/product-card.tsx", metadata: { testStatus: pickTestStatus(27) } },
  { id: nodeId(28), type: "component", name: "CartDrawer", filePath: "src/components/cart-drawer.tsx", metadata: { testStatus: pickTestStatus(28) } },
  { id: nodeId(29), type: "component", name: "CheckoutForm", filePath: "src/components/checkout-form.tsx", metadata: { testStatus: pickTestStatus(29) } },
  { id: nodeId(30), type: "component", name: "LoginForm", filePath: "src/components/login-form.tsx", metadata: { testStatus: pickTestStatus(30) } },
  { id: nodeId(31), type: "component", name: "RegisterForm", filePath: "src/components/register-form.tsx", metadata: { testStatus: pickTestStatus(31) } },
  { id: nodeId(32), type: "component", name: "UserAvatar", filePath: "src/components/user-avatar.tsx", metadata: { testStatus: pickTestStatus(32) } },
  { id: nodeId(33), type: "component", name: "SearchBar", filePath: "src/components/search-bar.tsx", metadata: { testStatus: pickTestStatus(33) } },
  { id: nodeId(34), type: "component", name: "DataTable", filePath: "src/components/data-table.tsx", metadata: { testStatus: pickTestStatus(34) } },
  { id: nodeId(35), type: "component", name: "Modal", filePath: "src/components/modal.tsx", metadata: { testStatus: pickTestStatus(35) } },
  { id: nodeId(36), type: "component", name: "Toast", filePath: "src/components/toast.tsx", metadata: { testStatus: pickTestStatus(36) } },
  // Models (6)
  { id: nodeId(37), type: "model", name: "User", filePath: "prisma/schema.prisma", metadata: { fields: ["id", "email", "name", "role"], testStatus: pickTestStatus(37) } },
  { id: nodeId(38), type: "model", name: "Product", filePath: "prisma/schema.prisma", metadata: { fields: ["id", "name", "price", "stock"], testStatus: pickTestStatus(38) } },
  { id: nodeId(39), type: "model", name: "Order", filePath: "prisma/schema.prisma", metadata: { fields: ["id", "userId", "total", "status"], testStatus: pickTestStatus(39) } },
  { id: nodeId(40), type: "model", name: "Payment", filePath: "prisma/schema.prisma", metadata: { fields: ["id", "orderId", "amount", "method"], testStatus: pickTestStatus(40) } },
  { id: nodeId(41), type: "model", name: "Session", filePath: "prisma/schema.prisma", metadata: { fields: ["id", "userId", "token", "expires"], testStatus: pickTestStatus(41) } },
  { id: nodeId(42), type: "model", name: "Cart", filePath: "prisma/schema.prisma", metadata: { fields: ["id", "userId", "items"], testStatus: pickTestStatus(42) } },
  // Auth strategies (3)
  { id: nodeId(43), type: "auth_strategy", name: "JWT", filePath: "src/lib/auth/jwt.ts", metadata: { testStatus: pickTestStatus(43) } },
  { id: nodeId(44), type: "auth_strategy", name: "OAuth", filePath: "src/lib/auth/oauth.ts", metadata: { testStatus: pickTestStatus(44) } },
  { id: nodeId(45), type: "auth_strategy", name: "SessionCookie", filePath: "src/lib/auth/session.ts", metadata: { testStatus: pickTestStatus(45) } },
];

// ============================================================
// SYSTEM MAP EDGES — 52 edges
// ============================================================

export interface EdgeDef {
  id: string;
  sourceIndex: number;
  targetIndex: number;
  relationship: string;
}

function edgeId(i: number): string {
  return `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
}

export const EDGES: EdgeDef[] = [
  // Navigation
  { id: edgeId(1), sourceIndex: 1, targetIndex: 2, relationship: "navigates_to" },
  { id: edgeId(2), sourceIndex: 3, targetIndex: 2, relationship: "navigates_to" },
  { id: edgeId(3), sourceIndex: 1, targetIndex: 8, relationship: "navigates_to" },
  { id: edgeId(4), sourceIndex: 8, targetIndex: 9, relationship: "navigates_to" },
  { id: edgeId(5), sourceIndex: 8, targetIndex: 7, relationship: "navigates_to" },
  { id: edgeId(6), sourceIndex: 9, targetIndex: 10, relationship: "navigates_to" },
  { id: edgeId(7), sourceIndex: 10, targetIndex: 7, relationship: "navigates_to" },
  { id: edgeId(8), sourceIndex: 4, targetIndex: 3, relationship: "navigates_to" },
  { id: edgeId(9), sourceIndex: 2, targetIndex: 11, relationship: "navigates_to" },
  { id: edgeId(10), sourceIndex: 1, targetIndex: 3, relationship: "navigates_to" },
  // API calls
  { id: edgeId(11), sourceIndex: 7, targetIndex: 21, relationship: "calls_api" },
  { id: edgeId(12), sourceIndex: 3, targetIndex: 19, relationship: "calls_api" },
  { id: edgeId(13), sourceIndex: 4, targetIndex: 20, relationship: "calls_api" },
  { id: edgeId(14), sourceIndex: 2, targetIndex: 16, relationship: "calls_api" },
  { id: edgeId(15), sourceIndex: 8, targetIndex: 17, relationship: "calls_api" },
  { id: edgeId(16), sourceIndex: 11, targetIndex: 18, relationship: "calls_api" },
  { id: edgeId(17), sourceIndex: 10, targetIndex: 22, relationship: "calls_api" },
  { id: edgeId(18), sourceIndex: 14, targetIndex: 23, relationship: "calls_api" },
  { id: edgeId(19), sourceIndex: 13, targetIndex: 24, relationship: "calls_api" },
  { id: edgeId(20), sourceIndex: 6, targetIndex: 16, relationship: "calls_api" },
  { id: edgeId(21), sourceIndex: 5, targetIndex: 16, relationship: "calls_api" },
  { id: edgeId(22), sourceIndex: 12, targetIndex: 16, relationship: "calls_api" },
  // Component rendering
  { id: edgeId(23), sourceIndex: 2, targetIndex: 25, relationship: "renders" },
  { id: edgeId(24), sourceIndex: 2, targetIndex: 26, relationship: "renders" },
  { id: edgeId(25), sourceIndex: 2, targetIndex: 34, relationship: "renders" },
  { id: edgeId(26), sourceIndex: 8, targetIndex: 27, relationship: "renders" },
  { id: edgeId(27), sourceIndex: 8, targetIndex: 25, relationship: "renders" },
  { id: edgeId(28), sourceIndex: 7, targetIndex: 29, relationship: "renders" },
  { id: edgeId(29), sourceIndex: 3, targetIndex: 30, relationship: "renders" },
  { id: edgeId(30), sourceIndex: 4, targetIndex: 31, relationship: "renders" },
  { id: edgeId(31), sourceIndex: 6, targetIndex: 32, relationship: "renders" },
  { id: edgeId(32), sourceIndex: 14, targetIndex: 33, relationship: "renders" },
  { id: edgeId(33), sourceIndex: 1, targetIndex: 25, relationship: "renders" },
  { id: edgeId(34), sourceIndex: 9, targetIndex: 28, relationship: "renders" },
  { id: edgeId(35), sourceIndex: 11, targetIndex: 34, relationship: "renders" },
  { id: edgeId(36), sourceIndex: 12, targetIndex: 34, relationship: "renders" },
  // Data model usage
  { id: edgeId(37), sourceIndex: 16, targetIndex: 37, relationship: "uses_model" },
  { id: edgeId(38), sourceIndex: 17, targetIndex: 38, relationship: "uses_model" },
  { id: edgeId(39), sourceIndex: 18, targetIndex: 39, relationship: "uses_model" },
  { id: edgeId(40), sourceIndex: 21, targetIndex: 40, relationship: "uses_model" },
  { id: edgeId(41), sourceIndex: 19, targetIndex: 41, relationship: "uses_model" },
  { id: edgeId(42), sourceIndex: 22, targetIndex: 42, relationship: "uses_model" },
  { id: edgeId(43), sourceIndex: 20, targetIndex: 37, relationship: "uses_model" },
  { id: edgeId(44), sourceIndex: 18, targetIndex: 40, relationship: "uses_model" },
  { id: edgeId(45), sourceIndex: 24, targetIndex: 37, relationship: "uses_model" },
  { id: edgeId(46), sourceIndex: 21, targetIndex: 39, relationship: "uses_model" },
  // Auth dependencies
  { id: edgeId(47), sourceIndex: 19, targetIndex: 43, relationship: "uses_auth" },
  { id: edgeId(48), sourceIndex: 19, targetIndex: 45, relationship: "uses_auth" },
  { id: edgeId(49), sourceIndex: 20, targetIndex: 43, relationship: "uses_auth" },
  { id: edgeId(50), sourceIndex: 2, targetIndex: 43, relationship: "requires_auth" },
  { id: edgeId(51), sourceIndex: 5, targetIndex: 43, relationship: "requires_auth" },
  { id: edgeId(52), sourceIndex: 12, targetIndex: 44, relationship: "uses_auth" },
];

// ============================================================
// AUDIT LOG ENTRIES
// ============================================================

export interface AuditDef {
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export const AUDIT_ENTRIES: AuditDef[] = [
  { action: "workspace.created", resourceType: "workspace", resourceId: IDS.workspace, metadata: { name: "Orbit Demo" }, createdAt: subDays(now, 7) },
  { action: "project.created", resourceType: "project", resourceId: IDS.project, metadata: { name: "Acme Dashboard", repoUrl: "https://github.com/vercel/next.js" }, createdAt: subDays(now, 7) },
  { action: "environment.created", resourceType: "environment", resourceId: IDS.environments.staging, metadata: { type: "staging" }, createdAt: subDays(now, 7) },
  { action: "secret.added", resourceType: "secret", resourceId: null, metadata: { key: "STRIPE_TEST_KEY", environment: "staging" }, createdAt: subDays(now, 6) },
  { action: "test_plan.generated", resourceType: "test_plan", resourceId: IDS.testPlan, metadata: { testCount: 15, version: 1 }, createdAt: subDays(now, 6) },
  { action: "test_run.triggered", resourceType: "test_run", resourceId: IDS.runs[0], metadata: { mode: "full", trigger: "manual" }, createdAt: subDays(now, 6) },
  { action: "test_run.completed", resourceType: "test_run", resourceId: IDS.runs[0], metadata: { passed: 12, failed: 2, flaky: 1 }, createdAt: subDays(now, 6) },
  { action: "member.invited", resourceType: "user", resourceId: IDS.users.member, metadata: { email: "member@orbit-test.com", role: "member" }, createdAt: subDays(now, 5) },
  { action: "test_run.triggered", resourceType: "test_run", resourceId: IDS.runs[1], metadata: { mode: "smoke", trigger: "push" }, createdAt: subDays(now, 4) },
  { action: "project.settings_updated", resourceType: "project", resourceId: IDS.project, metadata: { changed: ["defaultBranch", "framework"] }, createdAt: subDays(now, 1) },
];

// ============================================================
// TEST CASES
// ============================================================

function caseId(i: number): string {
  return `40000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
}

export interface TestCaseDef {
  id: string;
  name: string;
  type: "journey" | "api_contract" | "auth" | "form_validation" | "edge_case";
  journey: string | null;
  priorityScore: number;
  criticality: number;
  risk: number;
  coverageGap: number;
  isCritical: boolean;
  steps: Prisma.InputJsonValue;
  rationale: string;
}

import type { Prisma } from "../src/generated/prisma/client";

export const TEST_CASES: TestCaseDef[] = [
  { id: caseId(1), name: "User registration flow", type: "journey", journey: "Onboarding", priorityScore: 95, criticality: 90, risk: 85, coverageGap: 40, isCritical: true, steps: [{ action: "navigate", target: "/register" }, { action: "fill", target: "input[name=email]", value: "test@example.com" }, { action: "click", target: "button[type=submit]" }], rationale: "Registration is the primary entry point." },
  { id: caseId(2), name: "Login and dashboard access", type: "journey", journey: "Onboarding", priorityScore: 92, criticality: 95, risk: 80, coverageGap: 30, isCritical: true, steps: [{ action: "navigate", target: "/login" }, { action: "fill", target: "input[name=email]", value: "admin@example.com" }, { action: "click", target: "button[type=submit]" }], rationale: "Login is the most-used flow." },
  { id: caseId(3), name: "Product browse to checkout", type: "journey", journey: "Purchase", priorityScore: 88, criticality: 85, risk: 90, coverageGap: 55, isCritical: true, steps: [{ action: "navigate", target: "/products" }, { action: "click", target: ".product-card" }], rationale: "Core revenue flow." },
  { id: caseId(4), name: "Profile update flow", type: "journey", journey: "Settings", priorityScore: 65, criticality: 50, risk: 40, coverageGap: 60, isCritical: false, steps: [{ action: "navigate", target: "/profile" }, { action: "fill", target: "input[name=name]", value: "Updated" }], rationale: "Profile updates affect user identity." },
  { id: caseId(5), name: "GET /api/users returns user list", type: "api_contract", journey: "API", priorityScore: 78, criticality: 70, risk: 60, coverageGap: 45, isCritical: false, steps: [{ action: "api_call", method: "GET", target: "/api/users" }], rationale: "User list powers admin panel." },
  { id: caseId(6), name: "POST /api/orders creates order", type: "api_contract", journey: "API", priorityScore: 82, criticality: 80, risk: 75, coverageGap: 50, isCritical: true, steps: [{ action: "api_call", method: "POST", target: "/api/orders" }], rationale: "Order creation is critical for revenue." },
  { id: caseId(7), name: "Auth rejects invalid credentials", type: "auth", journey: "Security", priorityScore: 90, criticality: 95, risk: 95, coverageGap: 35, isCritical: true, steps: [{ action: "api_call", method: "POST", target: "/api/auth/login" }], rationale: "Auth bypass is highest-severity risk." },
  { id: caseId(8), name: "Protected routes redirect unauthenticated", type: "auth", journey: "Security", priorityScore: 87, criticality: 90, risk: 85, coverageGap: 40, isCritical: true, steps: [{ action: "clear_cookies" }, { action: "navigate", target: "/dashboard" }], rationale: "Unauthorized access exposes user data." },
  { id: caseId(9), name: "Token refresh works correctly", type: "auth", journey: "Security", priorityScore: 75, criticality: 80, risk: 70, coverageGap: 65, isCritical: false, steps: [{ action: "set_expired_token" }, { action: "navigate", target: "/dashboard" }], rationale: "Broken refresh causes mass logouts." },
  { id: caseId(10), name: "Registration validates email format", type: "form_validation", journey: "Onboarding", priorityScore: 70, criticality: 60, risk: 50, coverageGap: 55, isCritical: false, steps: [{ action: "navigate", target: "/register" }, { action: "fill", target: "input[name=email]", value: "invalid" }], rationale: "Invalid emails break welcome flows." },
  { id: caseId(11), name: "Checkout form requires all fields", type: "form_validation", journey: "Purchase", priorityScore: 76, criticality: 75, risk: 65, coverageGap: 50, isCritical: false, steps: [{ action: "navigate", target: "/checkout" }, { action: "click", target: "button[type=submit]" }], rationale: "Incomplete checkout causes payment failures." },
  { id: caseId(12), name: "XSS payload in search is sanitized", type: "edge_case", journey: "Security", priorityScore: 85, criticality: 90, risk: 95, coverageGap: 70, isCritical: true, steps: [{ action: "navigate", target: "/search" }, { action: "fill", target: "input[name=q]", value: "<script>alert(1)</script>" }], rationale: "XSS in search is most common reflected XSS." },
  { id: caseId(13), name: "Double-click doesn't create duplicate", type: "edge_case", journey: "Purchase", priorityScore: 72, criticality: 65, risk: 80, coverageGap: 75, isCritical: false, steps: [{ action: "navigate", target: "/checkout" }, { action: "double_click", target: "button[type=submit]" }], rationale: "Double-submit causes duplicate charges." },
  { id: caseId(14), name: "Search returns relevant results", type: "journey", journey: "Search", priorityScore: 60, criticality: 55, risk: 40, coverageGap: 65, isCritical: false, steps: [{ action: "navigate", target: "/search" }, { action: "fill", target: "input[name=q]", value: "headphones" }], rationale: "Search is fastest path to purchase." },
  { id: caseId(15), name: "Cart persists after refresh", type: "edge_case", journey: "Purchase", priorityScore: 68, criticality: 60, risk: 55, coverageGap: 70, isCritical: false, steps: [{ action: "navigate", target: "/products" }, { action: "click", target: "button.add-to-cart" }, { action: "reload" }], rationale: "Lost carts cause abandoned purchases." },
];

// ============================================================
// TEST RUNS
// ============================================================

export interface RunDef {
  id: string;
  status: "completed" | "failed";
  mode: "full" | "smoke" | "regression" | "targeted";
  trigger: "push" | "pr" | "scheduled" | "manual";
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  creditsConsumed: number;
  branch: string;
  commitSha: string;
  summary: string;
  createdAt: Date;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
}

export const RUNS: RunDef[] = [
  { id: IDS.runs[0], status: "completed", mode: "full", trigger: "manual", totalTests: 15, passed: 12, failed: 2, flaky: 1, skipped: 0, creditsConsumed: 15, branch: "main", commitSha: "a3f8b2c", summary: "Full suite — 2 failures, 1 flaky", createdAt: subDays(now, 6), startedAt: subDays(now, 6), completedAt: subMinutes(subDays(now, 6), -45), durationMs: 2700000 },
  { id: IDS.runs[1], status: "completed", mode: "smoke", trigger: "push", totalTests: 5, passed: 5, failed: 0, flaky: 0, skipped: 0, creditsConsumed: 5, branch: "feat/new-header", commitSha: "d91e4f7", summary: "Smoke tests all passing", createdAt: subDays(now, 4), startedAt: subDays(now, 4), completedAt: subMinutes(subDays(now, 4), -12), durationMs: 720000 },
  { id: IDS.runs[2], status: "completed", mode: "regression", trigger: "pr", totalTests: 9, passed: 8, failed: 1, flaky: 0, skipped: 0, creditsConsumed: 9, branch: "fix/checkout-bug", commitSha: "7c2a1b9", summary: "Regression — 1 failure in cart test", createdAt: subDays(now, 3), startedAt: subDays(now, 3), completedAt: subMinutes(subDays(now, 3), -28), durationMs: 1680000 },
  { id: IDS.runs[3], status: "failed", mode: "full", trigger: "scheduled", totalTests: 15, passed: 0, failed: 0, flaky: 0, skipped: 0, creditsConsumed: 2, branch: "main", commitSha: "e5f6a8d", summary: "Run failed: staging unreachable (503)", createdAt: subDays(now, 2), startedAt: subDays(now, 2), completedAt: subMinutes(subDays(now, 2), -3), durationMs: 180000 },
  { id: IDS.runs[4], status: "completed", mode: "targeted", trigger: "manual", totalTests: 3, passed: 3, failed: 0, flaky: 0, skipped: 0, creditsConsumed: 3, branch: "main", commitSha: "1b3d5f7", summary: "Targeted auth tests — all passing", createdAt: subDays(now, 1), startedAt: subDays(now, 1), completedAt: subMinutes(subDays(now, 1), -8), durationMs: 480000 },
];

// ============================================================
// TEST RESULTS
// ============================================================

export interface ResultDef {
  runIndex: number;
  caseIndex: number;
  verdict: "pass" | "fail" | "flaky" | "healed";
  durationMs: number;
  retryCount: number;
  failureExplanation: string | null;
  suggestedFix: string | null;
  steps: Prisma.InputJsonValue;
}

export const RESULTS: ResultDef[] = [
  { runIndex: 0, caseIndex: 0, verdict: "pass", durationMs: 8200, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 0, caseIndex: 1, verdict: "pass", durationMs: 6400, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 0, caseIndex: 2, verdict: "fail", durationMs: 15300, retryCount: 1, failureExplanation: "Checkout button disabled during loading state", suggestedFix: "Wait for button to be enabled before clicking", steps: [] },
  { runIndex: 0, caseIndex: 3, verdict: "pass", durationMs: 4800, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 0, caseIndex: 4, verdict: "pass", durationMs: 2100, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 0, caseIndex: 5, verdict: "pass", durationMs: 3400, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 0, caseIndex: 6, verdict: "pass", durationMs: 2800, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 0, caseIndex: 7, verdict: "pass", durationMs: 3200, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 0, caseIndex: 8, verdict: "flaky", durationMs: 12400, retryCount: 2, failureExplanation: "Token refresh returned 503 on first attempt", suggestedFix: "Add retry with backoff for token refresh", steps: [] },
  { runIndex: 0, caseIndex: 9, verdict: "pass", durationMs: 4200, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 0, caseIndex: 10, verdict: "pass", durationMs: 3800, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 0, caseIndex: 11, verdict: "pass", durationMs: 5600, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 0, caseIndex: 12, verdict: "fail", durationMs: 18200, retryCount: 1, failureExplanation: "Double-click created duplicate orders", suggestedFix: "Disable button after first click or use idempotency key", steps: [] },
  { runIndex: 0, caseIndex: 13, verdict: "pass", durationMs: 5100, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 0, caseIndex: 14, verdict: "pass", durationMs: 7300, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 1, caseIndex: 0, verdict: "pass", durationMs: 7800, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 1, caseIndex: 1, verdict: "pass", durationMs: 5900, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 1, caseIndex: 2, verdict: "pass", durationMs: 14100, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 1, caseIndex: 6, verdict: "pass", durationMs: 2600, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 1, caseIndex: 7, verdict: "pass", durationMs: 3000, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 2, caseIndex: 0, verdict: "pass", durationMs: 8500, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 2, caseIndex: 1, verdict: "pass", durationMs: 6200, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 2, caseIndex: 2, verdict: "pass", durationMs: 13800, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 2, caseIndex: 4, verdict: "pass", durationMs: 2300, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 2, caseIndex: 5, verdict: "pass", durationMs: 3100, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 2, caseIndex: 6, verdict: "pass", durationMs: 2900, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 2, caseIndex: 7, verdict: "pass", durationMs: 3400, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 2, caseIndex: 11, verdict: "pass", durationMs: 5400, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 2, caseIndex: 14, verdict: "fail", durationMs: 22100, retryCount: 1, failureExplanation: "Cart localStorage cleared on reload in incognito", suggestedFix: "Use same browser context for reload step", steps: [] },
  { runIndex: 4, caseIndex: 6, verdict: "pass", durationMs: 2500, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 4, caseIndex: 7, verdict: "healed", durationMs: 4100, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
  { runIndex: 4, caseIndex: 8, verdict: "pass", durationMs: 11200, retryCount: 0, failureExplanation: null, suggestedFix: null, steps: [] },
];
