import type { ASTResult, ImportInfo } from "@/services/indexing/ast-parser";

interface UIElement {
  tag: string;
  text?: string;
  type?: string;
  name?: string;
  ariaLabel?: string;
  role?: string;
  href?: string;
  required?: boolean;
}

interface ComponentNode {
  name: string;
  filePath: string;
  isExported: boolean;
  isInteractive: boolean;
  children: string[];
  dependencies: string[];
  uiElements: UIElement[];
}

interface ComponentMap {
  components: ComponentNode[];
  relationships: ComponentRelationship[];
}

interface ComponentRelationship {
  parent: string;
  child: string;
  type: "renders" | "imports";
}

const INTERACTIVE_INDICATORS = [
  "onClick",
  "onSubmit",
  "onChange",
  "onInput",
  "onBlur",
  "onFocus",
  "onKeyDown",
  "onKeyUp",
  "handleClick",
  "handleSubmit",
  "handleChange",
  "useState",
  "useForm",
  "button",
  "Button",
  "input",
  "Input",
  "form",
  "Form",
  "select",
  "Select",
  "textarea",
  "modal",
  "Modal",
  "dialog",
  "Dialog",
];

function detectInteractivity(content: string): boolean {
  return INTERACTIVE_INDICATORS.some((indicator) =>
    content.includes(indicator)
  );
}

function extractAttr(attrs: string, attrName: string): string | undefined {
  const pattern = new RegExp(
    `${attrName}=(?:"([^"]*)"|'([^']*)'|\\{['"\`]([^'"\`]*)['"\`]\\})`,
    "i"
  );
  const match = pattern.exec(attrs);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

function extractUIElements(content: string): UIElement[] {
  const elements: UIElement[] = [];
  const tagPattern = /<(button|input|select|textarea|a|form)\b([^>]*)>/gi;
  const MAX_ELEMENTS = 50;

  let match: RegExpExecArray | null;
  while (
    (match = tagPattern.exec(content)) !== null &&
    elements.length < MAX_ELEMENTS
  ) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];

    const element: UIElement = { tag };

    const typeVal = extractAttr(attrs, "type");
    if (typeVal) element.type = typeVal;

    const nameVal = extractAttr(attrs, "name");
    if (nameVal) element.name = nameVal;

    const ariaLabel = extractAttr(attrs, "aria-label");
    if (ariaLabel) element.ariaLabel = ariaLabel;

    const role = extractAttr(attrs, "role");
    if (role) element.role = role;

    const href = extractAttr(attrs, "href");
    if (href) element.href = href;

    if (/\brequired\b/.test(attrs) && !/required=\{false\}/.test(attrs)) {
      element.required = true;
    }

    // Extract text content for button and a tags
    if (tag === "button" || tag === "a") {
      const closingPattern = new RegExp(
        `<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`,
        "gi"
      );
      closingPattern.lastIndex = match.index;
      const textMatch = closingPattern.exec(content);
      if (textMatch) {
        const inner = textMatch[0]
          .replace(/^<[^>]*>/, "")
          .replace(/<\/[^>]*>$/, "");
        const text = inner.replace(/<[^>]*>/g, "").trim();
        if (text && text.length <= 100) element.text = text;
      }
    }

    elements.push(element);
  }

  return elements;
}

function resolveImportToComponent(
  imp: ImportInfo,
  componentsByFile: Map<string, string[]>,
  filePath: string
): string[] {
  const resolved: string[] = [];

  // Check if any imported specifier matches a known component name
  for (const spec of imp.specifiers) {
    // PascalCase check - components start with uppercase
    if (/^[A-Z]/.test(spec)) {
      resolved.push(spec);
    }
  }

  // Try to resolve the import source to a file path
  if (imp.source.startsWith(".") || imp.source.startsWith("@/")) {
    const normalizedSource = normalizeImportPath(imp.source, filePath);
    const components = componentsByFile.get(normalizedSource);
    if (components) {
      // Only include specifiers that match known components
      for (const spec of imp.specifiers) {
        if (components.includes(spec)) {
          resolved.push(spec);
        }
      }
    }
  }

  return Array.from(new Set(resolved));
}

function normalizeImportPath(importSource: string, _fromFile: string): string {
  // Handle @ alias
  if (importSource.startsWith("@/")) {
    return "src/" + importSource.slice(2);
  }
  return importSource;
}

function findComponentUsages(
  content: string,
  knownComponents: Set<string>
): string[] {
  const used: string[] = [];

  for (const name of Array.from(knownComponents)) {
    // Check for JSX usage: <ComponentName or <ComponentName>
    const jsxPattern = new RegExp(`<${name}[\\s/>]`);
    if (jsxPattern.test(content)) {
      used.push(name);
    }
  }

  return used;
}

export function buildComponentMap(
  astResults: ASTResult[],
  fileContents: Map<string, string>
): ComponentMap {
  const components: ComponentNode[] = [];
  const relationships: ComponentRelationship[] = [];

  // First pass: collect all components by file
  const componentsByFile = new Map<string, string[]>();
  const allComponentNames = new Set<string>();

  for (const ast of astResults) {
    if (ast.components.length > 0) {
      componentsByFile.set(ast.filePath, ast.components);
      for (const comp of ast.components) {
        allComponentNames.add(comp);
      }
    }
  }

  // Second pass: build component nodes and find relationships
  for (const ast of astResults) {
    const content = fileContents.get(ast.filePath) ?? "";

    for (const compName of ast.components) {
      const isExported = ast.exports.includes(compName);
      const uiElements = extractUIElements(content);
      const isInteractive =
        detectInteractivity(content) || uiElements.length > 0;

      // Find child components used in this file
      const usedComponents = findComponentUsages(content, allComponentNames);
      const children = usedComponents.filter((c) => c !== compName);

      // Find dependencies from imports
      const dependencies: string[] = [];
      for (const imp of ast.imports) {
        const resolved = resolveImportToComponent(
          imp,
          componentsByFile,
          ast.filePath
        );
        dependencies.push(...resolved);
      }

      components.push({
        name: compName,
        filePath: ast.filePath,
        isExported,
        isInteractive,
        children,
        dependencies: Array.from(new Set(dependencies)),
        uiElements,
      });

      // Create relationships for child components
      for (const child of children) {
        relationships.push({
          parent: compName,
          child,
          type: "renders",
        });
      }

      // Create import relationships
      for (const dep of dependencies) {
        if (dep !== compName && !children.includes(dep)) {
          relationships.push({
            parent: compName,
            child: dep,
            type: "imports",
          });
        }
      }
    }
  }

  return { components, relationships };
}

export type { ComponentNode, ComponentMap, ComponentRelationship, UIElement };
