/**
 * Dev tool, not part of the app. Converts API handlers written as
 *
 *   export async function POST(request, { params }) {
 *     try {
 *       const { workspaceId } = await requireWorkspace();      // or: const { workspaceId } = await params;
 *       await requirePermission(workspaceId, "x.y");
 *       ...
 *     } catch (error) { return handleApiError(error); }
 *   }
 *
 * into `export const POST = route({ permission: "x.y" }, async ({ req: request, workspaceId }) => { ... })`.
 * A handler that does not match that shape exactly is left alone and reported with the reason.
 *
 *   npx tsx scripts/codemods/route-wrapper.ts [--write] [--skip a.ts,b.ts] [dir-or-file ...]
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const REMOVABLE_IMPORTS = ["requireWorkspace", "requirePermission", "handleApiError", "NextRequest"];
const ROUTE_IMPORT = 'import { route } from "@/server/http/route";';

interface Edit { start: number; end: number; text: string }
interface Outcome { file: string; handler: string; converted: boolean; reason?: string }

function usesName(root: ts.Node, name: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isIdentifier(node) && node.text === name) {
      const p = node.parent;
      const isMember = (ts.isPropertyAccessExpression(p) && p.name === node) ||
        (ts.isPropertyAssignment(p) && p.name === node) || (ts.isPropertySignature(p) && p.name === node);
      if (!isMember) { found = true; return; }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

const text = (n: ts.Node, sf: ts.SourceFile) => n.getText(sf);
const isCall = (e: ts.Expression | undefined, name: string): e is ts.CallExpression =>
  !!e && ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === name;
const awaited = (e: ts.Expression | undefined): ts.Expression | undefined =>
  e && ts.isAwaitExpression(e) ? e.expression : undefined;

function bindingNames(d: ts.VariableDeclaration): string[] | null {
  if (!ts.isObjectBindingPattern(d.name)) return null;
  const names: string[] = [];
  for (const el of d.name.elements) {
    if (el.propertyName || el.initializer || el.dotDotDotToken || !ts.isIdentifier(el.name)) return null;
    names.push(el.name.text);
  }
  return names;
}

/** Statement `const {a,b} = await <ident>` / `await <call>` -> its parts, else null. */
function awaitedDeclaration(st: ts.Statement) {
  if (!ts.isVariableStatement(st) || st.declarationList.declarations.length !== 1) return null;
  const d = st.declarationList.declarations[0];
  return { decl: d, call: awaited(d.initializer) };
}

function convertHandler(fn: ts.FunctionDeclaration, sf: ts.SourceFile): { edit: Edit } | { reason: string } {
  const method = fn.name!.text;
  const [reqParam, segParam] = fn.parameters;
  if (fn.parameters.length > 2) return { reason: "more than two parameters" };
  if (reqParam && !ts.isIdentifier(reqParam.name)) return { reason: "request param is destructured" };
  const stmts = fn.body?.statements ?? [];
  const tryStmt = stmts[0];
  if (stmts.length !== 1 || !ts.isTryStatement(tryStmt) || tryStmt.finallyBlock) return { reason: "body is not a lone try/catch" };
  const catchStmts = tryStmt.catchClause?.block.statements ?? [];
  const catchVar = tryStmt.catchClause?.variableDeclaration?.name.getText(sf);
  if (catchStmts.length !== 1 || !ts.isReturnStatement(catchStmts[0]) || !isCall(catchStmts[0].expression, "handleApiError") ||
      text((catchStmts[0].expression as ts.CallExpression).arguments[0], sf) !== catchVar) {
    return { reason: "catch is not `return handleApiError(e)`" };
  }

  let segName: string | null = null;
  if (segParam) {
    const name = segParam.name;
    if (!ts.isObjectBindingPattern(name) || name.elements.length !== 1 || name.elements[0].getText(sf) !== "params") {
      return { reason: "second param is not `{ params }`" };
    }
    segName = "params";
  }

  const body = [...tryStmt.tryBlock.statements];
  let paramElements: string[] = [];
  let wantSession = false, wantRole = false, wantWorkspace = false, wantAuth = false;
  let alias: string | null = null; // `const ctx = await requirePermission(...)`
  let permission: string | null = null;
  let workspaceFromParam = false;
  const dropped = new Set<ts.Statement>();

  for (const st of body) {
    const info = awaitedDeclaration(st);
    const expr = ts.isExpressionStatement(st) ? awaited(st.expression) : info?.call;
    if (isCall(expr, "requireWorkspace")) {
      const names = info ? bindingNames(info.decl) : [];
      if (!names || (permission !== null)) return { reason: "unsupported requireWorkspace destructuring" };
      if (names.some((n) => !["session", "workspaceId", "role"].includes(n))) return { reason: "uses a requireWorkspace field route() does not provide" };
      wantSession ||= names.includes("session"); wantRole ||= names.includes("role"); wantWorkspace ||= names.includes("workspaceId");
      dropped.add(st);
    } else if (isCall(expr, "requirePermission")) {
      const [wsArg, permArg] = expr.arguments;
      if (!wsArg || !permArg || text(wsArg, sf) !== "workspaceId" || !ts.isStringLiteral(permArg)) return { reason: "requirePermission args are not (workspaceId, \"literal\")" };
      if (info && ts.isIdentifier(info.decl.name)) alias = info.decl.name.text;
      const names = alias ? [] : info ? bindingNames(info.decl) : [];
      if (!names || names.some((n) => !["session", "workspaceId", "role"].includes(n))) return { reason: "uses a requirePermission field route() does not provide" };
      wantSession ||= names.includes("session"); wantRole ||= names.includes("role"); wantWorkspace ||= names.includes("workspaceId");
      if (permission !== null) return { reason: "two requirePermission calls" };
      permission = permArg.getText(sf);
      dropped.add(st);
    } else if (segName && info && text(info.call ?? sf, sf) === "params" && info.call && ts.isIdentifier(info.call)) {
      if (!ts.isObjectBindingPattern(info.decl.name)) return { reason: "params not destructured" };
      paramElements.push(...info.decl.name.elements.map((e) => e.getText(sf)));
      dropped.add(st);
    }
  }

  const rest = body.filter((s) => !dropped.has(s));
  // Auth must stay the first thing that runs: a statement ahead of it would now run after it.
  const firstKept = body.findIndex((st) => !dropped.has(st));
  if (firstKept >= 0 && body.slice(firstKept).some((st) => dropped.has(st))) return { reason: "code runs before the auth preamble" };
  const any = (name: string) => rest.some((s) => usesName(s, name));
  const aliasEdits: Edit[] = [];
  if (alias) {
    const members: Record<string, string> = { session: "session", workspaceId: "workspaceId", role: "session.role", memberId: "auth.memberId" };
    let bad = false;
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && node.text === alias && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
        const p = node.parent;
        if (ts.isPropertyAccessExpression(p) && p.expression === node && members[p.name.text]) {
          aliasEdits.push({ start: p.getStart(sf), end: p.getEnd(), text: members[p.name.text] });
          if (p.name.text === "session" || p.name.text === "role") wantSession = true;
          if (p.name.text === "workspaceId") wantWorkspace = true;
          if (p.name.text === "memberId") wantAuth = true;
        } else bad = true;
      }
      ts.forEachChild(node, visit);
    };
    rest.forEach(visit);
    if (bad) return { reason: `\`${alias}\` is used other than as ${alias}.session/workspaceId/role/memberId` };
  }
  for (const banned of ["requireWorkspace", "requirePermission", "handleApiError"]) {
    if (any(banned)) return { reason: `${banned} used outside the recognised preamble` };
  }
  if (segName && any("params")) return { reason: "params used beyond a plain destructure" };

  const hasSessionAuth = Array.from(dropped).some((s) => /requireWorkspace/.test(text(s, sf)));
  // Shape B: the workspace id comes from the path.
  if (!hasSessionAuth) {
    if (!paramElements.includes("workspaceId")) return { reason: "no requireWorkspace and no workspaceId path param" };
    workspaceFromParam = true;
    wantWorkspace = true;
    paramElements = paramElements.filter((e) => e !== "workspaceId");
  }
  if (any("workspaceId")) wantWorkspace = true;

  const names: string[] = [];
  if (reqParam && any(reqParam.name.getText(sf))) {
    const rn = reqParam.name.getText(sf);
    names.push(rn === "req" ? "req" : `req: ${rn}`);
  }
  if (paramElements.length) names.push(`params: { ${paramElements.join(", ")} }`);
  if (wantWorkspace) names.push("workspaceId");
  if (wantSession || wantRole) names.push("session");
  if (wantAuth) names.push("auth");

  const specParts: string[] = [];
  if (workspaceFromParam) specParts.push('workspace: "param"');
  if (permission) specParts.push(`permission: ${permission}`);
  const spec = specParts.length ? `{ ${specParts.join(", ")} }` : "{}";

  const indent = "  ";
  const first = rest[0];
  const startPos = first ? first.getFullStart() : tryStmt.tryBlock.getStart(sf) + 1;
  const lastEnd = rest.length ? rest[rest.length - 1].getEnd() : startPos;
  let raw = sf.text.slice(startPos, lastEnd);
  for (const e of aliasEdits.sort((a, b) => b.start - a.start)) {
    raw = raw.slice(0, e.start - startPos) + e.text + raw.slice(e.end - startPos);
  }
  const preamble = wantRole ? `const { role } = session;` : "";
  const argList = names.length ? `{ ${names.join(", ")} }` : "";
  const compactHeader = `export const ${method} = route(${spec}, async (${argList}) => {`;
  // Short signatures stay on one line and the body moves out one level; long ones wrap and the body keeps its indent.
  const compact = compactHeader.length <= 100;
  const lines = raw.split("\n").map((l) => (compact && l.startsWith(indent) ? l.slice(indent.length) : l)).join("\n");
  const bodyText = lines.replace(/^\s*\n/, "\n");
  const pre = preamble ? `\n${compact ? indent : indent + indent}${preamble}` : "";
  const out = compact
    ? `${compactHeader}${pre}${bodyText}\n});`
    : `export const ${method} = route(\n${indent}${spec},\n${indent}async (${argList}) => {${pre}${bodyText}\n${indent}}\n);`;
  return { edit: { start: fn.getStart(sf), end: fn.getEnd(), text: out } };
}

function cleanImports(source: string, file: string): string {
  let sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edits: Edit[] = [];
  for (const imp of sf.statements.filter(ts.isImportDeclaration)) {
    const named = imp.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named) || imp.importClause?.name) continue;
    const keep = named.elements.filter((el) => {
      if (!REMOVABLE_IMPORTS.includes(el.name.text)) return true;
      return sf.statements.some((s) => !ts.isImportDeclaration(s) && usesName(s, el.name.text));
    });
    if (keep.length === named.elements.length) continue;
    const from = imp.moduleSpecifier.getText(sf);
    const specifiers = keep.map((e) => e.getText(sf));
    const oneLine = `import { ${specifiers.join(", ")} } from ${from};`;
    const replacement = keep.length === 0 ? "" : oneLine.length <= 100 ? oneLine : `import {\n  ${specifiers.join(",\n  ")},\n} from ${from};`;
    edits.push({ start: imp.getStart(sf), end: imp.getEnd() + (keep.length === 0 ? 1 : 0), text: replacement });
  }
  let result = source;
  for (const e of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, e.start) + e.text + result.slice(e.end);
  sf = ts.createSourceFile(file, result, ts.ScriptTarget.Latest, true);
  const lastImport = sf.statements.filter(ts.isImportDeclaration).pop();
  return lastImport ? result.slice(0, lastImport.getEnd()) + `\n${ROUTE_IMPORT}` + result.slice(lastImport.getEnd()) : `${ROUTE_IMPORT}\n${result}`;
}

export function convertFile(file: string, source: string): { source: string; outcomes: Outcome[] } {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edits: Edit[] = [];
  const outcomes: Outcome[] = [];
  for (const st of sf.statements) {
    if (!ts.isFunctionDeclaration(st) || !st.name || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(st.name.text)) continue;
    const result = convertHandler(st, sf);
    if ("edit" in result) edits.push(result.edit);
    outcomes.push({ file, handler: st.name.text, converted: "edit" in result, reason: "reason" in result ? result.reason : undefined });
  }
  if (!edits.length) return { source, outcomes };
  let out = source;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { source: cleanImports(out, file), outcomes };
}

function walk(target: string): string[] {
  if (fs.statSync(target).isFile()) return [target];
  return fs.readdirSync(target).flatMap((n) => walk(path.join(target, n))).filter((f) => f.endsWith("route.ts"));
}

if (process.argv[1] && path.basename(process.argv[1]) === "route-wrapper.ts") {
  const targets: string[] = [];
  let write = false;
  let skip: string[] = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--write") write = true;
    else if (args[i] === "--skip") skip = args[++i].split(",");
    else targets.push(args[i]);
  }
  const files = (targets.length ? targets : ["src/app/api"]).flatMap(walk).filter((f) => !skip.some((s) => f.endsWith(s)));
  for (const file of files.sort()) {
    const { source, outcomes } = convertFile(file, fs.readFileSync(file, "utf8"));
    for (const o of outcomes) console.log(`${o.converted ? "CONVERT" : "SKIP   "} ${o.file} ${o.handler}${o.reason ? `  (${o.reason})` : ""}`);
    if (write && outcomes.some((o) => o.converted)) fs.writeFileSync(file, source);
  }
}
