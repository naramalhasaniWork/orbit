import type { ASTResult, ImportInfo } from "@/services/indexing/ast-parser";

interface ComponentNode {
  name: string;
  filePath: string;
  isExported: boolean;
  isInteractive: boolean;
  children: string[];
  dependencies: string[];
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
      const isInteractive = detectInteractivity(content);

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

export type { ComponentNode, ComponentMap, ComponentRelationship };
