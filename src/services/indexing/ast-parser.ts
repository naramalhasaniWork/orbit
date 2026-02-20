import { parseFileRegex } from "./ast-parser-regex";

// ============================================================
// Types
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
// Tree-sitter initialization (lazy, optional)
// web-tree-sitter namespace types are incomplete — use dynamic typing
// ============================================================

let parserInstance: import("web-tree-sitter").Parser | null = null;
let tsLanguage: import("web-tree-sitter").Language | null = null;
let jsLanguage: import("web-tree-sitter").Language | null = null;
let treeSitterAvailable: boolean | null = null;

async function getParser(
  isTypeScript: boolean
): Promise<import("web-tree-sitter").Parser | null> {
  if (treeSitterAvailable === false) return null;

  try {
    const { Parser, Language } = await import("web-tree-sitter");

    if (!parserInstance) {
      await Parser.init();
      parserInstance = new Parser();
    }

    if (isTypeScript && !tsLanguage) {
      const wasmPath = require.resolve(
        "tree-sitter-wasms/out/tree-sitter-typescript.wasm"
      );
      tsLanguage = await Language.load(wasmPath);
    }

    if (!isTypeScript && !jsLanguage) {
      const wasmPath = require.resolve(
        "tree-sitter-wasms/out/tree-sitter-javascript.wasm"
      );
      jsLanguage = await Language.load(wasmPath);
    }

    parserInstance.setLanguage(isTypeScript ? tsLanguage : jsLanguage);
    treeSitterAvailable = true;
    return parserInstance;
  } catch {
    treeSitterAvailable = false;
    return null;
  }
}

// ============================================================
// AST extraction helpers
// ============================================================

function extractExports(tree: any): string[] {
  const exports: string[] = [];
  for (const node of tree.rootNode.descendantsOfType("export_statement")) {
    const decl = node.namedChildren.find((c: any) =>
      [
        "function_declaration",
        "class_declaration",
        "lexical_declaration",
        "interface_declaration",
        "type_alias_declaration",
        "enum_declaration",
      ].includes(c.type)
    );

    if (decl) {
      const nameNode =
        decl.childForFieldName("name") ??
        decl
          .descendantsOfType("variable_declarator")[0]
          ?.childForFieldName("name");
      if (nameNode) exports.push(nameNode.text);
    }

    for (const spec of node.descendantsOfType("export_specifier")) {
      const name = spec.childForFieldName("name") ?? spec.namedChildren[0];
      if (name) exports.push(name.text);
    }
  }
  return Array.from(new Set(exports));
}

function extractImports(tree: any): ImportInfo[] {
  const imports: ImportInfo[] = [];
  for (const node of tree.rootNode.descendantsOfType("import_statement")) {
    const sourceNode = node.descendantsOfType("string")[0];
    if (!sourceNode) continue;
    const source = sourceNode.text.replace(/['"]/g, "");
    const specifiers: string[] = [];
    let isDefault = false;

    const defaultImport = node
      .descendantsOfType("identifier")
      .find((id: any) => id.parent?.type === "import_clause");
    if (defaultImport) {
      specifiers.push(defaultImport.text);
      isDefault = true;
    }

    for (const spec of node.descendantsOfType("import_specifier")) {
      const name = spec.childForFieldName("name") ?? spec.namedChildren[0];
      if (name) specifiers.push(name.text);
    }

    for (const ns of node.descendantsOfType("namespace_import")) {
      const alias = ns.namedChildren.find(
        (c: any) => c.type === "identifier"
      );
      if (alias) specifiers.push(alias.text);
    }

    imports.push({
      source,
      specifiers,
      isDefault: isDefault && specifiers.length === 1,
    });
  }
  return imports;
}

function extractParams(node: any): string[] {
  const params: string[] = [];
  const formalParams = node.descendantsOfType("formal_parameters")[0];
  if (!formalParams) return params;
  for (const child of formalParams.namedChildren) {
    if (
      child.type === "required_parameter" ||
      child.type === "optional_parameter"
    ) {
      const pattern = child.childForFieldName("pattern");
      if (pattern) params.push(pattern.text);
    } else if (child.type === "identifier") {
      params.push(child.text);
    }
  }
  return params;
}

function extractFunctions(tree: any): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const seen = new Set<string>();
  const root = tree.rootNode;

  for (const node of root.descendantsOfType("function_declaration")) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode || seen.has(nameNode.text)) continue;
    seen.add(nameNode.text);
    const returnType = node.childForFieldName("return_type");
    functions.push({
      name: nameNode.text,
      isExported: node.parent?.type === "export_statement",
      isAsync: node.text.startsWith("async"),
      params: extractParams(node),
      returnType: returnType?.text.replace(/^:\s*/, ""),
    });
  }

  for (const node of root.descendantsOfType("variable_declarator")) {
    const arrow = node.descendantsOfType("arrow_function")[0];
    if (!arrow) continue;
    const nameNode = node.childForFieldName("name");
    if (!nameNode || seen.has(nameNode.text)) continue;
    seen.add(nameNode.text);
    functions.push({
      name: nameNode.text,
      isExported: node.parent?.parent?.type === "export_statement",
      isAsync: arrow.text.startsWith("async"),
      params: extractParams(arrow),
    });
  }
  return functions;
}

function extractClasses(tree: any): string[] {
  return tree.rootNode
    .descendantsOfType("class_declaration")
    .map((n: any) => n.childForFieldName("name")?.text)
    .filter((n: any): n is string => !!n);
}

function extractTypes(tree: any): string[] {
  const types: string[] = [];
  for (const node of tree.rootNode.descendantsOfType(
    "interface_declaration"
  )) {
    const name = node.childForFieldName("name");
    if (name) types.push(name.text);
  }
  for (const node of tree.rootNode.descendantsOfType(
    "type_alias_declaration"
  )) {
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
  return Array.from(envVars);
}

const COMPONENT_PATTERN = /^[A-Z][a-zA-Z0-9]*$/;

function detectComponents(
  functions: FunctionInfo[],
  content: string
): string[] {
  return functions
    .filter((fn) => COMPONENT_PATTERN.test(fn.name))
    .filter(
      () =>
        content.includes("<") &&
        (content.includes("return (") ||
          content.includes("return(<") ||
          content.includes("React.createElement"))
    )
    .map((fn) => fn.name);
}

// ============================================================
// Public API
// ============================================================

export async function parseFileAsync(
  filePath: string,
  content: string
): Promise<ASTResult> {
  const isTs = filePath.endsWith(".ts") || filePath.endsWith(".tsx");

  const parser = await getParser(isTs);
  if (!parser) {
    return parseFileRegex(filePath, content);
  }

  const tree = parser.parse(content);

  return {
    filePath,
    exports: extractExports(tree),
    imports: extractImports(tree),
    functions: extractFunctions(tree),
    classes: extractClasses(tree),
    components: detectComponents(extractFunctions(tree), content),
    types: extractTypes(tree),
    envVars: extractEnvVars(content),
  };
}

/** Synchronous fallback using regex */
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
      results.push(parseFileRegex(f.path, f.content));
    }
  }
  return results;
}

export type { ASTResult, ImportInfo, FunctionInfo };
