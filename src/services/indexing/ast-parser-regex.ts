/**
 * Regex-based AST parser — fallback when tree-sitter WASM is unavailable.
 */

import type { ASTResult, ImportInfo, FunctionInfo } from "./ast-parser";

const NAMED_EXPORT_RE =
  /export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+(\w+)/g;
const DEFAULT_EXPORT_NAMED_RE =
  /export\s+default\s+(?:async\s+)?(?:function|class)\s+(\w+)/g;
const RE_EXPORT_RE = /export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
const IMPORT_RE =
  /import\s+(?:(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*)?['"]([^'"]+)['"]/g;
const FUNCTION_RE =
  /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
const ARROW_FN_RE =
  /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(?([^)=]*)\)?\s*=>/g;
const CLASS_RE = /(?:export\s+)?class\s+(\w+)/g;
const TYPE_RE = /(?:export\s+)?(?:interface|type)\s+(\w+)/g;
const COMPONENT_PATTERN = /^[A-Z][a-zA-Z0-9]*$/;
const ENV_VAR_RE = /process\.env\.(\w+)/g;

function regexExtract(content: string, regex: RegExp, group: number): string[] {
  const results: string[] = [];
  const cloned = new RegExp(regex.source, regex.flags);
  let match: RegExpExecArray | null;
  while ((match = cloned.exec(content)) !== null) {
    const val = match[group];
    if (val) results.push(val.trim());
  }
  return results;
}

function regexExtractImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const re = new RegExp(IMPORT_RE.source, IMPORT_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const defaultImport = match[1];
    const namedImports = match[2];
    const source = match[3];
    if (!source) continue;
    const specifiers: string[] = [];
    if (defaultImport) specifiers.push(defaultImport);
    if (namedImports) {
      specifiers.push(
        ...namedImports.split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
      );
    }
    imports.push({ source, specifiers, isDefault: !!defaultImport && !namedImports });
  }
  return imports;
}

function regexExtractFunctions(content: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const seen = new Set<string>();

  const fnRe = new RegExp(FUNCTION_RE.source, FUNCTION_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = fnRe.exec(content)) !== null) {
    const name = match[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const paramStr = match[2] ?? "";
    const params = paramStr.split(",").map((p) => p.trim().split(":")[0].trim()).filter(Boolean);
    functions.push({
      name,
      isExported: match[0].startsWith("export"),
      isAsync: match[0].includes("async"),
      params,
    });
  }

  const arrowRe = new RegExp(ARROW_FN_RE.source, ARROW_FN_RE.flags);
  while ((match = arrowRe.exec(content)) !== null) {
    const name = match[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const paramStr = match[2] ?? "";
    const params = paramStr.split(",").map((p) => p.trim().split(":")[0].trim()).filter(Boolean);
    functions.push({
      name,
      isExported: match[0].startsWith("export"),
      isAsync: match[0].includes("async"),
      params,
    });
  }

  return functions;
}

function detectComponents(functions: FunctionInfo[], content: string): string[] {
  const components: string[] = [];
  for (const fn of functions) {
    if (!COMPONENT_PATTERN.test(fn.name)) continue;
    const hasJsx =
      content.includes("<") &&
      (content.includes("return (") || content.includes("return(<") || content.includes("React.createElement"));
    if (hasJsx) components.push(fn.name);
  }
  return components;
}

export function parseFileRegex(filePath: string, content: string): ASTResult {
  const exports = [
    ...regexExtract(content, NAMED_EXPORT_RE, 1),
    ...regexExtract(content, DEFAULT_EXPORT_NAMED_RE, 1),
  ];

  const reExportRe = new RegExp(RE_EXPORT_RE.source, RE_EXPORT_RE.flags);
  let reMatch: RegExpExecArray | null;
  while ((reMatch = reExportRe.exec(content)) !== null) {
    const names = reMatch[1];
    if (names) {
      exports.push(
        ...names.split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
      );
    }
  }

  const imports = regexExtractImports(content);
  const functions = regexExtractFunctions(content);
  const classes = regexExtract(content, CLASS_RE, 1);
  const types = regexExtract(content, TYPE_RE, 1);
  const components = detectComponents(functions, content);
  const envVars = Array.from(new Set(regexExtract(content, ENV_VAR_RE, 1)));

  return {
    filePath,
    exports: Array.from(new Set(exports)),
    imports,
    functions,
    classes,
    components,
    types,
    envVars,
  };
}
