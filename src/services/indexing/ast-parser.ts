import Parser from "web-tree-sitter";

// ============================================================
// Types — preserved from original for backwards compatibility
// ============================================================

interface ASTResult {
  filePath: string;
  exports: string[];
  imports: ImportInfo[];
  functions: FunctionInfo[];
  classes: string[];
  components: string[];
  types: string[];
  envVars: string[];
}

interface ImportInfo {
  source: string;
  specifiers: string[];
  isDefault: boolean;
}

interface FunctionInfo {
  name: string;
  isExported: boolean;
  isAsync: boolean;
  params: string[];
  returnType?: string;
}

// ============================================================
// Parser initialization (lazy singleton)
// ============================================================

let parserInstance: Parser | null = null;
let tsLanguage: Parser.Language | null = null;
let jsLanguage: Parser.Language | null = null;

async function getParser(isTypeScript: boolean): Promise<Parser> {
  if (!parserInstance) {
    await Parser.init();
    parserInstance = new Parser();
  }

  if (isTypeScript && !tsLanguage) {
    const wasmPath = require.resolve("tree-sitter-wasms/out/tree-sitter-typescript.wasm");
    tsLanguage = await Parser.Language.load(wasmPath);
  }

  if (!isTypeScript && !jsLanguage) {
    const wasmPath = require.resolve("tree-sitter-wasms/out/tree-sitter-javascript.wasm");
    jsLanguage = await Parser.Language.load(wasmPath);
  }

  parserInstance.setLanguage(isTypeScript ? tsLanguage! : jsLanguage!);
  return parserInstance;
}

function isTypeScriptFile(filePath: string): boolean {
  return filePath.endsWith(".ts") || filePath.endsWith(".tsx");
}

// ============================================================
// AST extraction helpers
// ============================================================

function extractExports(tree: Parser.Tree): string[] {
  const exports: string[] = [];
  const root = tree.rootNode;

  // Named exports: export function/const/class/interface/type/enum
  const exportQuery = root.descendantsOfType("export_statement");
  for (const node of exportQuery) {
    const decl = node.namedChildren.find(
      (c) =>
        c.type === "function_declaration" ||
        c.type === "class_declaration" ||
        c.type === "lexical_declaration" ||
        c.type === "interface_declaration" ||
        c.type === "type_alias_declaration" ||
        c.type === "enum_declaration"
    );

    if (decl) {
      const nameNode =
        decl.childForFieldName("name") ??
        decl.descendantsOfType("variable_declarator")[0]?.childForFieldName("name");
      if (nameNode) exports.push(nameNode.text);
    }

    // export { a, b } — named export specifiers
    const exportClause = node.descendantsOfType("export_specifier");
    for (const spec of exportClause) {
      const name = spec.childForFieldName("name") ?? spec.namedChildren[0];
      if (name) exports.push(name.text);
    }
  }

  return [...new Set(exports)];
}

function extractImports(tree: Parser.Tree): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const root = tree.rootNode;

  for (const node of root.descendantsOfType("import_statement")) {
    const sourceNode = node.descendantsOfType("string")[0];
    if (!sourceNode) continue;
    const source = sourceNode.text.replace(/['"]/g, "");

    const specifiers: string[] = [];
    let isDefault = false;

    // Default import
    const defaultImport = node.descendantsOfType("identifier").find(
      (id) => id.parent?.type === "import_clause"
    );
    if (defaultImport) {
      specifiers.push(defaultImport.text);
      isDefault = true;
    }

    // Named imports
    for (const spec of node.descendantsOfType("import_specifier")) {
      const name = spec.childForFieldName("name") ?? spec.namedChildren[0];
      if (name) specifiers.push(name.text);
    }

    // Namespace import: import * as Foo
    for (const ns of node.descendantsOfType("namespace_import")) {
      const alias = ns.namedChildren.find((c) => c.type === "identifier");
      if (alias) specifiers.push(alias.text);
    }

    imports.push({ source, specifiers, isDefault: isDefault && specifiers.length === 1 });
  }

  return imports;
}

function extractFunctions(tree: Parser.Tree): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const seen = new Set<string>();
  const root = tree.rootNode;

  // Function declarations
  for (const node of root.descendantsOfType("function_declaration")) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode || seen.has(nameNode.text)) continue;
    seen.add(nameNode.text);

    functions.push({
      name: nameNode.text,
      isExported: node.parent?.type === "export_statement",
      isAsync: node.text.startsWith("async"),
      params: extractParams(node),
      returnType: extractReturnType(node),
    });
  }

  // Arrow functions: const foo = (params) => ...
  for (const node of root.descendantsOfType("variable_declarator")) {
    const arrow = node.descendantsOfType("arrow_function")[0];
    if (!arrow) continue;
    const nameNode = node.childForFieldName("name");
    if (!nameNode || seen.has(nameNode.text)) continue;
    seen.add(nameNode.text);

    const isExported =
      node.parent?.parent?.type === "export_statement";

    functions.push({
      name: nameNode.text,
      isExported,
      isAsync: arrow.text.startsWith("async"),
      params: extractParams(arrow),
      returnType: extractReturnType(arrow),
    });
  }

  return functions;
}

function extractParams(node: Parser.SyntaxNode): string[] {
  const params: string[] = [];
  const formalParams = node.descendantsOfType("formal_parameters")[0];
  if (!formalParams) return params;

  for (const child of formalParams.namedChildren) {
    if (child.type === "required_parameter" || child.type === "optional_parameter") {
      const pattern = child.childForFieldName("pattern");
      if (pattern) params.push(pattern.text);
    } else if (child.type === "identifier") {
      params.push(child.text);
    }
  }
  return params;
}

function extractReturnType(node: Parser.SyntaxNode): string | undefined {
  const returnType = node.childForFieldName("return_type");
  if (returnType) {
    // Remove leading ': '
    return returnType.text.replace(/^:\s*/, "");
  }
  return undefined;
}

function extractClasses(tree: Parser.Tree): string[] {
  return tree.rootNode
    .descendantsOfType("class_declaration")
    .map((n) => n.childForFieldName("name")?.text)
    .filter((n): n is string => !!n);
}

function extractTypes(tree: Parser.Tree): string[] {
  const types: string[] = [];
  const root = tree.rootNode;

  for (const node of root.descendantsOfType("interface_declaration")) {
    const name = node.childForFieldName("name");
    if (name) types.push(name.text);
  }

  for (const node of root.descendantsOfType("type_alias_declaration")) {
    const name = node.childForFieldName("name");
    if (name) types.push(name.text);
  }

  return types;
}

function extractEnvVars(content: string): string[] {
  const envVars = new Set<string>();
  const re = /process\.env\.(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match[1]) envVars.add(match[1]);
  }
  return [...envVars];
}

const COMPONENT_PATTERN = /^[A-Z][a-zA-Z0-9]*$/;

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

// ============================================================
// Public API
// ============================================================

export async function parseFileAsync(filePath: string, content: string): Promise<ASTResult> {
  const isTsx = filePath.endsWith(".tsx");
  const isTs = filePath.endsWith(".ts") || isTsx;

  // tree-sitter is fault-tolerant — it handles partial/invalid code
  const parser = await getParser(isTs);
  const tree = parser.parse(content);

  const exports = extractExports(tree);
  const imports = extractImports(tree);
  const functions = extractFunctions(tree);
  const classes = extractClasses(tree);
  const types = extractTypes(tree);
  const envVars = extractEnvVars(content);
  const components = detectComponents(functions, content);

  return {
    filePath,
    exports,
    imports,
    functions,
    classes,
    components,
    types,
    envVars,
  };
}

/**
 * Synchronous fallback using regex — used when tree-sitter WASM fails to load.
 * This preserves the original regex-based parser as a fallback.
 */
export function parseFile(filePath: string, content: string): ASTResult {
  return parseFileRegex(filePath, content);
}

export function parseFiles(
  files: Array<{ path: string; content: string }>
): ASTResult[] {
  return files.map((f) => parseFileRegex(f.path, f.content));
}

export async function parseFilesAsync(
  files: Array<{ path: string; content: string }>
): Promise<ASTResult[]> {
  const results: ASTResult[] = [];
  for (const f of files) {
    try {
      results.push(await parseFileAsync(f.path, f.content));
    } catch {
      // Fall back to regex parser on failure
      results.push(parseFileRegex(f.path, f.content));
    }
  }
  return results;
}

// ============================================================
// Regex fallback (original implementation)
// ============================================================

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

function parseFileRegex(filePath: string, content: string): ASTResult {
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
  const envVars = extractEnvVars(content);

  return {
    filePath,
    exports: [...new Set(exports)],
    imports,
    functions,
    classes,
    components,
    types,
    envVars,
  };
}

export type { ASTResult, ImportInfo, FunctionInfo };
