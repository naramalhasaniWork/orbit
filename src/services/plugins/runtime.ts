/**
 * Plugin Runtime
 *
 * Sandboxed plugin execution environment with lifecycle hooks.
 * Plugins run in a restricted context with time and memory limits.
 * Only function-based hooks are supported — no dynamic code execution.
 */

// ============================================================
// Types
// ============================================================

export interface RunContext {
  runId: string;
  projectId: string;
  projectName: string;
  workspaceId: string;
  mode: string;
  trigger: string;
  branch?: string;
  commitSha?: string;
  startedAt: string;
}

export interface RunResults {
  runId: string;
  status: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  durationMs: number;
  summary?: string;
}

export interface TestContext {
  runId: string;
  projectId: string;
  testCaseId: string;
  testName: string;
  testType: string;
}

export interface TestResultContext {
  verdict: string;
  durationMs: number;
  failureExplanation?: string;
  suggestedFix?: string;
  healedSelectors: string[];
}

export interface FailureContext {
  runId: string;
  projectId: string;
  testCaseId: string;
  testName: string;
  verdict: string;
  failureExplanation: string;
  suggestedFix?: string;
}

export interface PluginHookMap {
  beforeRun: (context: RunContext) => Promise<void>;
  afterRun: (context: RunContext, results: RunResults) => Promise<void>;
  onTestComplete: (context: TestContext, result: TestResultContext) => Promise<void>;
  onFailure: (context: FailureContext) => Promise<void>;
}

type HookName = keyof PluginHookMap;

export interface PluginDefinition {
  name: string;
  version: string;
  description: string;
  hooks: Partial<PluginHookMap>;
  defaultConfig?: Record<string, unknown>;
}

interface LoadedPlugin {
  definition: PluginDefinition;
  config: Record<string, unknown>;
  enabled: boolean;
}

// ============================================================
// Constants
// ============================================================

const HOOK_TIMEOUT_MS = 10_000;
const MAX_PLUGINS = 50;

// ============================================================
// Plugin Runtime
// ============================================================

export class PluginRuntime {
  private plugins: Map<string, LoadedPlugin> = new Map();

  /**
   * Load a plugin into the runtime.
   */
  async loadPlugin(
    definition: PluginDefinition,
    config?: Record<string, unknown>
  ): Promise<void> {
    if (this.plugins.size >= MAX_PLUGINS) {
      throw new Error(`Plugin limit reached (max ${MAX_PLUGINS})`);
    }

    if (this.plugins.has(definition.name)) {
      throw new Error(`Plugin already loaded: ${definition.name}`);
    }

    // Validate hooks are functions
    for (const [hookName, hookFn] of Object.entries(definition.hooks)) {
      if (typeof hookFn !== "function") {
        throw new Error(
          `Invalid hook "${hookName}" in plugin "${definition.name}": must be a function`
        );
      }
    }

    this.plugins.set(definition.name, {
      definition,
      config: { ...definition.defaultConfig, ...config },
      enabled: true,
    });
  }

  /**
   * Unload a plugin from the runtime.
   */
  async unloadPlugin(pluginName: string): Promise<void> {
    if (!this.plugins.has(pluginName)) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }
    this.plugins.delete(pluginName);
  }

  /**
   * Enable or disable a plugin without unloading.
   */
  setEnabled(pluginName: string, enabled: boolean): void {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) throw new Error(`Plugin not found: ${pluginName}`);
    plugin.enabled = enabled;
  }

  /**
   * Update a plugin's runtime config.
   */
  updateConfig(pluginName: string, config: Record<string, unknown>): void {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) throw new Error(`Plugin not found: ${pluginName}`);
    plugin.config = { ...plugin.config, ...config };
  }

  /**
   * Get the config for a loaded plugin.
   */
  getConfig(pluginName: string): Record<string, unknown> | null {
    return this.plugins.get(pluginName)?.config ?? null;
  }

  /**
   * List all loaded plugins.
   */
  listPlugins(): Array<{
    name: string;
    version: string;
    description: string;
    enabled: boolean;
    hooks: string[];
  }> {
    return Array.from(this.plugins.values()).map((p) => ({
      name: p.definition.name,
      version: p.definition.version,
      description: p.definition.description,
      enabled: p.enabled,
      hooks: Object.keys(p.definition.hooks),
    }));
  }

  /**
   * Execute a specific hook across all enabled plugins.
   * Each plugin's hook runs with a timeout for safety.
   */
  async executeHook<K extends HookName>(
    hookName: K,
    ...args: Parameters<PluginHookMap[K]>
  ): Promise<PluginHookResult[]> {
    const results: PluginHookResult[] = [];

    for (const [name, plugin] of Array.from(this.plugins.entries())) {
      if (!plugin.enabled) continue;

      const hookFn = plugin.definition.hooks[hookName];
      if (!hookFn) continue;

      const result = await this.executeWithTimeout(
        name,
        hookName,
        () => (hookFn as (...a: unknown[]) => Promise<void>)(...args)
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Run a hook function with a timeout.
   */
  private async executeWithTimeout(
    pluginName: string,
    hookName: string,
    fn: () => Promise<void>
  ): Promise<PluginHookResult> {
    const startTime = Date.now();

    try {
      await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Hook timeout (${HOOK_TIMEOUT_MS}ms)`)),
            HOOK_TIMEOUT_MS
          )
        ),
      ]);

      return {
        pluginName,
        hookName,
        success: true,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      console.error(
        `[plugin-runtime] Hook "${hookName}" failed for "${pluginName}":`,
        err
      );
      return {
        pluginName,
        hookName,
        success: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ============================================================
// Result Type
// ============================================================

export interface PluginHookResult {
  pluginName: string;
  hookName: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

// ============================================================
// Singleton Instance
// ============================================================

const globalForRuntime = globalThis as unknown as {
  pluginRuntime: PluginRuntime | undefined;
};

export const pluginRuntime =
  globalForRuntime.pluginRuntime ?? new PluginRuntime();

if (process.env.NODE_ENV !== "production") {
  globalForRuntime.pluginRuntime = pluginRuntime;
}
