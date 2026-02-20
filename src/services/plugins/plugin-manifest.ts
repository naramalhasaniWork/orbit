// ============================================================
// Plugin Manifest Interface
// Defines the plugin system contract for future marketplace
// ============================================================

/**
 * Lifecycle hooks a plugin can implement.
 */
interface PluginHooks {
  /** Called after repository indexing completes */
  onIndexComplete?: string;
  /** Called before test plan generation */
  onPlanStart?: string;
  /** Called after test plan generation */
  onPlanComplete?: string;
  /** Called before each test case execution */
  onTestStart?: string;
  /** Called after each test case execution */
  onTestComplete?: string;
  /** Called after a full run completes */
  onRunComplete?: string;
  /** Called when a failure is detected */
  onFailure?: string;
  /** Called when a selector is healed */
  onSelectorHealed?: string;
}

/**
 * Plugin permissions that must be declared.
 */
interface PluginPermissions {
  /** Access to read project configuration */
  readConfig?: boolean;
  /** Access to modify test plans */
  modifyPlans?: boolean;
  /** Access to read test results */
  readResults?: boolean;
  /** Access to browser during execution */
  browserAccess?: boolean;
  /** Access to make network requests */
  networkAccess?: boolean;
  /** Access to project secrets (encrypted) */
  secretAccess?: boolean;
}

/**
 * UI extension point for rendering custom panels.
 */
interface PluginUIExtension {
  /** Where to render: dashboard, run-detail, plan-detail, settings */
  slot: "dashboard" | "run-detail" | "plan-detail" | "settings";
  /** Display label */
  label: string;
  /** Component entry point (relative to plugin root) */
  component: string;
  /** Icon name from lucide-react */
  icon?: string;
}

/**
 * The plugin manifest format (orbit-plugin.json).
 */
export interface OrbitPluginManifest {
  /** Manifest format version */
  manifestVersion: 1;
  /** Unique plugin identifier (reverse-dns style) */
  id: string;
  /** Display name */
  name: string;
  /** Plugin version (semver) */
  version: string;
  /** Short description */
  description: string;
  /** Author name or organization */
  author: string;
  /** Plugin homepage or repository URL */
  homepage?: string;
  /** Minimum Orbit version required */
  minOrbitVersion?: string;
  /** Plugin entry point */
  main: string;
  /** Lifecycle hooks */
  hooks?: PluginHooks;
  /** Required permissions */
  permissions?: PluginPermissions;
  /** UI extension points */
  ui?: PluginUIExtension[];
  /** Plugin configuration schema (JSON Schema) */
  configSchema?: Record<string, unknown>;
}

/**
 * Validates a plugin manifest object.
 * Returns validation errors or an empty array if valid.
 */
export function validateManifest(
  manifest: unknown
): string[] {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== "object") {
    return ["Manifest must be a JSON object"];
  }

  const m = manifest as Record<string, unknown>;

  if (m.manifestVersion !== 1) {
    errors.push("manifestVersion must be 1");
  }

  if (!m.id || typeof m.id !== "string") {
    errors.push("id is required and must be a string");
  } else if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(m.id)) {
    errors.push("id must be lowercase alphanumeric with dots (reverse-dns style)");
  }

  if (!m.name || typeof m.name !== "string") {
    errors.push("name is required and must be a string");
  }

  if (!m.version || typeof m.version !== "string") {
    errors.push("version is required and must be a string");
  } else if (!/^\d+\.\d+\.\d+/.test(m.version)) {
    errors.push("version must follow semver format (e.g., 1.0.0)");
  }

  if (!m.description || typeof m.description !== "string") {
    errors.push("description is required and must be a string");
  }

  if (!m.author || typeof m.author !== "string") {
    errors.push("author is required and must be a string");
  }

  if (!m.main || typeof m.main !== "string") {
    errors.push("main entry point is required and must be a string");
  }

  if (m.permissions && typeof m.permissions !== "object") {
    errors.push("permissions must be an object");
  }

  if (m.hooks && typeof m.hooks !== "object") {
    errors.push("hooks must be an object");
  }

  if (m.ui) {
    if (!Array.isArray(m.ui)) {
      errors.push("ui must be an array of extension points");
    } else {
      const validSlots = new Set(["dashboard", "run-detail", "plan-detail", "settings"]);
      for (const ext of m.ui as PluginUIExtension[]) {
        if (!validSlots.has(ext.slot)) {
          errors.push(`Invalid UI slot: ${ext.slot}`);
        }
        if (!ext.label || !ext.component) {
          errors.push("Each UI extension must have label and component");
        }
      }
    }
  }

  return errors;
}

/**
 * Generate a template orbit-plugin.json manifest.
 */
export function generateManifestTemplate(): string {
  const template: OrbitPluginManifest = {
    manifestVersion: 1,
    id: "com.example.my-plugin",
    name: "My Orbit Plugin",
    version: "1.0.0",
    description: "A custom Orbit plugin",
    author: "Your Name",
    homepage: "https://github.com/your/plugin",
    minOrbitVersion: "1.0.0",
    main: "dist/index.js",
    hooks: {
      onRunComplete: "dist/hooks/on-run-complete.js",
      onFailure: "dist/hooks/on-failure.js",
    },
    permissions: {
      readResults: true,
      readConfig: true,
      networkAccess: false,
      browserAccess: false,
      secretAccess: false,
      modifyPlans: false,
    },
    ui: [
      {
        slot: "dashboard",
        label: "My Plugin Panel",
        component: "dist/ui/dashboard-panel.js",
        icon: "Puzzle",
      },
    ],
    configSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean", default: true },
        webhookUrl: { type: "string", format: "uri" },
      },
    },
  };

  return JSON.stringify(template, null, 2);
}
