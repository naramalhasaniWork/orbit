/**
 * Comprehensive DB schema sync script.
 * Since `prisma db push` fails due to vector columns, this script
 * manually creates all missing tables, enums, and columns.
 *
 * Run with: node scripts/sync-schema.mjs
 */
import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:REDACTED@centerbeam.proxy.rlwy.net:20409/railway";

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function run(sql, label) {
  try {
    await pool.query(sql);
    if (label) console.log(`  OK: ${label}`);
  } catch (err) {
    if (label) console.log(`  SKIP: ${label} — ${err.message.split("\n")[0]}`);
  }
}

async function main() {
  console.log("=== Orbit DB Schema Sync ===\n");

  // ──────────────────────────────────────
  // 1. EXTENSIONS
  // ──────────────────────────────────────
  console.log("1. Extensions");
  await run(`CREATE EXTENSION IF NOT EXISTS "vector"`, "vector extension");
  await run(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`, "uuid-ossp extension");

  // ──────────────────────────────────────
  // 2. ENUMS
  // ──────────────────────────────────────
  console.log("\n2. Enums");
  const enums = {
    '"ProjectStatus"': ["active", "archived", "paused"],
    '"RunStatus"': ["queued", "indexing", "planning", "executing", "reporting", "completed", "failed", "cancelled"],
    '"RunMode"': ["full", "smoke", "regression", "targeted"],
    '"RunTrigger"': ["push", "pr", "scheduled", "manual", "linear", "api", "deploy"],
    '"TestVerdict"': ["pass", "fail", "flaky", "skipped", "healed"],
    '"TestType"': ["journey", "api_contract", "auth", "form_validation", "edge_case", "regression", "visual_regression"],
    '"MemberRole"': ["owner", "admin", "member", "viewer", "billing"],
    '"WorkspaceTier"': ["free", "starter", "professional", "enterprise"],
    '"InvitationStatus"': ["pending", "accepted", "revoked", "expired"],
    '"SystemMapNodeType"': ["route", "component", "endpoint", "model", "auth_strategy", "middleware"],
    '"EnvironmentType"': ["staging", "preview", "qa", "production"],
    '"HealthStatus"': ["healthy", "degraded", "failing"],
    '"CreditTransactionType"': ["consumption", "purchase", "refund", "monthly_grant", "adjustment"],
    '"ArtifactType"': ["screenshot", "video", "dom_snapshot", "network_log", "console_log"],
    '"IntegrationProvider"': ["github", "gitlab", "linear", "slack", "railway"],
    '"WebhookEventStatus"': ["received", "processing", "processed", "failed", "ignored"],
    '"BaselineType"': ["screenshot", "api_response", "dom_structure"],
    '"KnowledgeFileType"': ["openapi", "markdown", "design_system", "business_rules", "test_credentials", "other"],
    '"UserRole"': ["user", "admin", "super_admin"],
    '"SubscriptionStatus"': ["active", "past_due", "canceled", "trialing", "incomplete", "unpaid"],
    '"AgentPhase"': ["analyst", "planner", "executor", "reporter", "auditor"],
  };

  for (const [name, values] of Object.entries(enums)) {
    const valList = values.map((v) => `'${v}'`).join(", ");
    await run(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${name.replace(/"/g, "")}') THEN CREATE TYPE ${name} AS ENUM (${valList}); END IF; END $$`,
      `enum ${name}`
    );
    // Add any missing values
    for (const v of values) {
      await run(
        `ALTER TYPE ${name} ADD VALUE IF NOT EXISTS '${v}'`,
        null // silent
      );
    }
  }

  // ──────────────────────────────────────
  // 3. CREATE MISSING TABLES
  // ──────────────────────────────────────
  console.log("\n3. Tables");

  // workspaces — ensure all columns
  await run(`
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS tier "WorkspaceTier" DEFAULT 'free';
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS credit_balance INT DEFAULT 100;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS monthly_credits INT DEFAULT 100;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS token_budget_monthly INT;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS run_limit INT DEFAULT 100;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS member_limit INT DEFAULT 2;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS project_limit INT DEFAULT 1;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_email TEXT;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMPTZ;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMPTZ;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `, "workspaces columns");

  // users — ensure role column
  await run(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role "UserRole" DEFAULT 'user';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS github_access_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
  `, "users columns");

  // workspace_members — ensure role column
  await run(`
    ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS role "MemberRole" DEFAULT 'member';
  `, "workspace_members columns");

  // accounts table
  await run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      expires_at INT,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      session_state TEXT,
      UNIQUE(provider, provider_account_id)
    )
  `, "accounts table");

  // sessions table
  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_token TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires TIMESTAMPTZ NOT NULL
    )
  `, "sessions table");

  // verification_tokens table
  await run(`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires TIMESTAMPTZ NOT NULL,
      UNIQUE(identifier, token)
    )
  `, "verification_tokens table");

  // environments — ensure all columns
  await run(`
    ALTER TABLE environments ADD COLUMN IF NOT EXISTS teardown_hook_url TEXT;
    ALTER TABLE environments ADD COLUMN IF NOT EXISTS source TEXT;
    ALTER TABLE environments ADD COLUMN IF NOT EXISTS source_id TEXT;
  `, "environments columns");

  // projects — ensure all columns
  await run(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS health_status "HealthStatus" DEFAULT 'healthy';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `, "projects columns");

  // test_plans — ensure all columns
  await run(`
    ALTER TABLE test_plans ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `, "test_plans columns");

  // test_cases — ensure all columns
  await run(`
    ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS criticality INT DEFAULT 50;
    ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS risk INT DEFAULT 50;
    ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS coverage_gap INT DEFAULT 50;
    ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS rationale TEXT;
    ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS edge_cases JSONB DEFAULT '[]';
    ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true;
    ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT false;
    ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS last_verdict "TestVerdict";
    ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
  `, "test_cases columns");

  // test_results — ensure all columns
  await run(`
    ALTER TABLE test_results ADD COLUMN IF NOT EXISTS failure_explanation TEXT;
    ALTER TABLE test_results ADD COLUMN IF NOT EXISTS suggested_fix TEXT;
    ALTER TABLE test_results ADD COLUMN IF NOT EXISTS healed_selectors JSONB DEFAULT '[]';
  `, "test_results columns");

  // scheduled_runs
  await run(`
    CREATE TABLE IF NOT EXISTS scheduled_runs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      mode "RunMode" DEFAULT 'smoke',
      environment_id UUID,
      is_enabled BOOLEAN DEFAULT true,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "scheduled_runs table");

  // credit_transactions
  await run(`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      type "CreditTransactionType" NOT NULL,
      amount INT NOT NULL,
      balance INT NOT NULL,
      description TEXT,
      test_run_id UUID,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "credit_transactions table");

  // webhook_events
  await run(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      provider "IntegrationProvider" NOT NULL,
      event TEXT NOT NULL,
      external_id TEXT,
      payload JSONB NOT NULL,
      status "WebhookEventStatus" DEFAULT 'received',
      error TEXT,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "webhook_events table");

  // token_usage
  await run(`
    CREATE TABLE IF NOT EXISTS token_usage (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_id UUID,
      model TEXT NOT NULL,
      input_tokens INT NOT NULL,
      output_tokens INT NOT NULL,
      cached_tokens INT DEFAULT 0,
      cost DECIMAL(10,6) NOT NULL,
      agent_phase "AgentPhase" NOT NULL,
      run_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "token_usage table");

  // agent_configs
  await run(`
    CREATE TABLE IF NOT EXISTS agent_configs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      agent_phase "AgentPhase" NOT NULL,
      model TEXT,
      temperature FLOAT,
      max_input_tokens INT,
      max_output_tokens INT,
      custom_prompt TEXT,
      is_enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(workspace_id, agent_phase)
    )
  `, "agent_configs table");

  // agent_execution_traces
  await run(`
    CREATE TABLE IF NOT EXISTS agent_execution_traces (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      project_id UUID NOT NULL,
      agent_phase "AgentPhase" NOT NULL,
      parent_trace_id UUID,
      status TEXT DEFAULT 'started',
      model TEXT,
      temperature FLOAT,
      input_summary TEXT,
      output_summary TEXT,
      reasoning_steps JSONB DEFAULT '[]',
      input_tokens INT DEFAULT 0,
      output_tokens INT DEFAULT 0,
      cost DECIMAL(10,6),
      error_message TEXT,
      duration_ms INT,
      metadata JSONB DEFAULT '{}',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `, "agent_execution_traces table");

  // integration_configs
  await run(`
    CREATE TABLE IF NOT EXISTS integration_configs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      provider "IntegrationProvider" NOT NULL,
      is_enabled BOOLEAN DEFAULT true,
      config JSONB DEFAULT '{}',
      credentials JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(workspace_id, provider)
    )
  `, "integration_configs table");

  // run_artifacts
  await run(`
    CREATE TABLE IF NOT EXISTS run_artifacts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      test_result_id UUID,
      type "ArtifactType" NOT NULL,
      storage_key TEXT NOT NULL,
      file_name TEXT,
      content_type TEXT,
      size_bytes INT,
      step_index INT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "run_artifacts table");

  // selector_history
  await run(`
    CREATE TABLE IF NOT EXISTS selector_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      selector_mapping_id UUID NOT NULL REFERENCES selector_mappings(id) ON DELETE CASCADE,
      previous_selector TEXT NOT NULL,
      new_selector TEXT NOT NULL,
      confidence FLOAT NOT NULL,
      test_run_id UUID,
      page_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "selector_history table");

  // test_case_versions
  await run(`
    CREATE TABLE IF NOT EXISTS test_case_versions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
      version INT NOT NULL,
      name TEXT NOT NULL,
      type "TestType" NOT NULL,
      steps JSONB NOT NULL,
      rationale TEXT,
      changed_by TEXT DEFAULT 'planner',
      change_note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(test_case_id, version)
    )
  `, "test_case_versions table");

  // failure_patterns
  await run(`
    CREATE TABLE IF NOT EXISTS failure_patterns (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      pattern TEXT NOT NULL,
      category TEXT NOT NULL,
      occurrences INT DEFAULT 1,
      test_case_ids JSONB DEFAULT '[]',
      first_seen_at TIMESTAMPTZ DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "failure_patterns table");

  // baseline_snapshots
  await run(`
    CREATE TABLE IF NOT EXISTS baseline_snapshots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      test_run_id UUID NOT NULL,
      type "BaselineType" NOT NULL,
      route_path TEXT,
      endpoint TEXT,
      storage_key TEXT NOT NULL,
      checksum TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "baseline_snapshots table");

  // plugin_installations
  await run(`
    CREATE TABLE IF NOT EXISTS plugin_installations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      plugin_name TEXT NOT NULL,
      version TEXT NOT NULL,
      is_enabled BOOLEAN DEFAULT true,
      config JSONB DEFAULT '{}',
      installed_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(workspace_id, plugin_name)
    )
  `, "plugin_installations table");

  // domain_knowledge_files
  await run(`
    CREATE TABLE IF NOT EXISTS domain_knowledge_files (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type "KnowledgeFileType" DEFAULT 'other',
      storage_key TEXT NOT NULL,
      size_bytes INT NOT NULL,
      chunk_count INT DEFAULT 0,
      embedding vector(1536),
      metadata JSONB DEFAULT '{}',
      uploaded_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "domain_knowledge_files table");

  // knowledge_chunks
  await run(`
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      knowledge_file_id UUID NOT NULL REFERENCES domain_knowledge_files(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL,
      content TEXT NOT NULL,
      chunk_index INT NOT NULL,
      embedding vector(1536),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "knowledge_chunks table");

  // webhook_subscriptions
  await run(`
    CREATE TABLE IF NOT EXISTS webhook_subscriptions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      events JSONB DEFAULT '[]',
      secret TEXT,
      is_enabled BOOLEAN DEFAULT true,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "webhook_subscriptions table");

  // workspace_invitations
  await run(`
    CREATE TABLE IF NOT EXISTS workspace_invitations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role "MemberRole" DEFAULT 'member',
      token TEXT UNIQUE NOT NULL,
      status "InvitationStatus" DEFAULT 'pending',
      invited_by UUID NOT NULL REFERENCES users(id),
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "workspace_invitations table");

  // workspace_usage
  await run(`
    CREATE TABLE IF NOT EXISTS workspace_usage (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      runs_used INT DEFAULT 0,
      credits_used INT DEFAULT 0,
      members_count INT DEFAULT 0,
      projects_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(workspace_id, month)
    )
  `, "workspace_usage table");

  // subscriptions
  await run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      stripe_subscription_id TEXT UNIQUE NOT NULL,
      status "SubscriptionStatus" DEFAULT 'active',
      current_period_start TIMESTAMPTZ NOT NULL,
      current_period_end TIMESTAMPTZ NOT NULL,
      cancel_at_period_end BOOLEAN DEFAULT false,
      price_id TEXT NOT NULL,
      tier "WorkspaceTier" DEFAULT 'free',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "subscriptions table");

  // invoices
  await run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      stripe_invoice_id TEXT UNIQUE NOT NULL,
      amount INT NOT NULL,
      currency TEXT DEFAULT 'usd',
      status TEXT NOT NULL,
      pdf_url TEXT,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "invoices table");

  // stripe_webhook_events
  await run(`
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      stripe_event_id TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      processed BOOLEAN DEFAULT false,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "stripe_webhook_events table");

  // system_configs
  await run(`
    CREATE TABLE IF NOT EXISTS system_configs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      key TEXT UNIQUE NOT NULL,
      value JSONB NOT NULL,
      updated_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "system_configs table");

  // platform_metrics
  await run(`
    CREATE TABLE IF NOT EXISTS platform_metrics (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      date DATE UNIQUE NOT NULL,
      total_workspaces INT DEFAULT 0,
      total_users INT DEFAULT 0,
      total_projects INT DEFAULT 0,
      total_runs INT DEFAULT 0,
      runs_today INT DEFAULT 0,
      credits_consumed INT DEFAULT 0,
      error_rate FLOAT DEFAULT 0,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "platform_metrics table");

  // audit_results
  await run(`
    CREATE TABLE IF NOT EXISTS audit_results (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      run_id UUID,
      overall_score INT NOT NULL,
      categories JSONB DEFAULT '{}',
      issues JSONB DEFAULT '[]',
      issue_count INT DEFAULT 0,
      critical_count INT DEFAULT 0,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "audit_results table");

  // provider_configs
  await run(`
    CREATE TABLE IF NOT EXISTS provider_configs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      display_name TEXT,
      api_key_encrypted TEXT,
      base_url TEXT,
      is_active BOOLEAN DEFAULT true,
      is_default BOOLEAN DEFAULT false,
      settings JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(workspace_id, provider)
    )
  `, "provider_configs table");

  // model_registry
  await run(`
    CREATE TABLE IF NOT EXISTS model_registry (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      context_window INT NOT NULL,
      input_cost_per_1m FLOAT NOT NULL,
      output_cost_per_1m FLOAT NOT NULL,
      capabilities JSONB,
      is_active BOOLEAN DEFAULT true,
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, model_id)
    )
  `, "model_registry table");

  // global_model_policies
  await run(`
    CREATE TABLE IF NOT EXISTS global_model_policies (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      model_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      is_allowed BOOLEAN DEFAULT true,
      required_tier TEXT,
      max_temperature FLOAT,
      requires_approval BOOLEAN DEFAULT false,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(model_id, provider)
    )
  `, "global_model_policies table");

  // prompt_versions
  await run(`
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
      agent_phase "AgentPhase" NOT NULL,
      prompt_type TEXT NOT NULL,
      content TEXT NOT NULL,
      version INT DEFAULT 1,
      is_active BOOLEAN DEFAULT true,
      created_by_id UUID REFERENCES users(id),
      changelog TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "prompt_versions table");

  // mcp_connections
  await run(`
    CREATE TABLE IF NOT EXISTS mcp_connections (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      server_url TEXT NOT NULL,
      transport_type TEXT DEFAULT 'sse',
      api_key_encrypted TEXT,
      api_key_iv TEXT,
      headers JSONB,
      is_active BOOLEAN DEFAULT true,
      tools_discovered JSONB,
      last_connected_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, "mcp_connections table");

  // ──────────────────────────────────────
  // 4. INDEXES
  // ──────────────────────────────────────
  console.log("\n4. Indexes");
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_scheduled_runs_project ON scheduled_runs(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_scheduled_runs_enabled ON scheduled_runs(is_enabled, next_run_at)",
    "CREATE INDEX IF NOT EXISTS idx_credit_txn_workspace ON credit_transactions(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_credit_txn_type ON credit_transactions(workspace_id, type)",
    "CREATE INDEX IF NOT EXISTS idx_credit_txn_date ON credit_transactions(workspace_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider, event)",
    "CREATE INDEX IF NOT EXISTS idx_webhook_events_project ON webhook_events(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status)",
    "CREATE INDEX IF NOT EXISTS idx_token_usage_workspace ON token_usage(workspace_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_token_usage_project ON token_usage(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_token_usage_run ON token_usage(run_id)",
    "CREATE INDEX IF NOT EXISTS idx_agent_configs_workspace ON agent_configs(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_agent_traces_run ON agent_execution_traces(run_id)",
    "CREATE INDEX IF NOT EXISTS idx_agent_traces_phase ON agent_execution_traces(run_id, agent_phase)",
    "CREATE INDEX IF NOT EXISTS idx_agent_traces_parent ON agent_execution_traces(parent_trace_id)",
    "CREATE INDEX IF NOT EXISTS idx_agent_traces_project ON agent_execution_traces(project_id, started_at)",
    "CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON invoices(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(workspace_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_stripe_events_id ON stripe_webhook_events(stripe_event_id)",
    "CREATE INDEX IF NOT EXISTS idx_stripe_events_date ON stripe_webhook_events(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_integration_configs_ws ON integration_configs(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_run_artifacts_run ON run_artifacts(test_run_id)",
    "CREATE INDEX IF NOT EXISTS idx_run_artifacts_result ON run_artifacts(test_result_id)",
    "CREATE INDEX IF NOT EXISTS idx_run_artifacts_type ON run_artifacts(project_id, type)",
    "CREATE INDEX IF NOT EXISTS idx_selector_history_mapping ON selector_history(selector_mapping_id)",
    "CREATE INDEX IF NOT EXISTS idx_selector_history_project ON selector_history(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_test_case_versions_case ON test_case_versions(test_case_id)",
    "CREATE INDEX IF NOT EXISTS idx_failure_patterns_project ON failure_patterns(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_failure_patterns_cat ON failure_patterns(project_id, category)",
    "CREATE INDEX IF NOT EXISTS idx_baseline_snapshots_project ON baseline_snapshots(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_baseline_snapshots_type ON baseline_snapshots(project_id, type)",
    "CREATE INDEX IF NOT EXISTS idx_plugin_installations_ws ON plugin_installations(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_knowledge_files_ws ON domain_knowledge_files(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_knowledge_files_type ON domain_knowledge_files(workspace_id, type)",
    "CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_file ON knowledge_chunks(knowledge_file_id)",
    "CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_ws ON knowledge_chunks(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_webhook_subs_ws ON webhook_subscriptions(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_ws_invitations_ws ON workspace_invitations(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_ws_invitations_email ON workspace_invitations(email)",
    "CREATE INDEX IF NOT EXISTS idx_ws_invitations_token ON workspace_invitations(token)",
    "CREATE INDEX IF NOT EXISTS idx_ws_usage_ws ON workspace_usage(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_subscriptions_ws ON subscriptions(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_audit_results_project ON audit_results(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_audit_results_date ON audit_results(project_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_provider_configs_ws ON provider_configs(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_model_registry_provider ON model_registry(provider)",
    "CREATE INDEX IF NOT EXISTS idx_prompt_versions_ws ON prompt_versions(workspace_id, agent_phase)",
    "CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON prompt_versions(agent_phase, is_active)",
    "CREATE INDEX IF NOT EXISTS idx_mcp_connections_ws ON mcp_connections(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_platform_metrics_date ON platform_metrics(date)",
  ];

  for (const idx of indexes) {
    await run(idx, null);
  }
  console.log(`  OK: ${indexes.length} indexes`);

  // ──────────────────────────────────────
  // 5. UNIQUE CONSTRAINTS for stripe fields on workspaces
  // ──────────────────────────────────────
  console.log("\n5. Constraints");
  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_stripe_customer_id_key'
      ) THEN
        ALTER TABLE workspaces ADD CONSTRAINT workspaces_stripe_customer_id_key UNIQUE (stripe_customer_id);
      END IF;
    END $$
  `, "stripe_customer_id unique");

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_stripe_subscription_id_key'
      ) THEN
        ALTER TABLE workspaces ADD CONSTRAINT workspaces_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
      END IF;
    END $$
  `, "stripe_subscription_id unique");

  // ──────────────────────────────────────
  // 6. FIX SUPERADMIN & WORKSPACE LIMITS
  // ──────────────────────────────────────
  console.log("\n6. Superadmin fix");
  await run(`
    UPDATE users SET role = 'super_admin' WHERE role IS NULL OR role = 'user' LIMIT 1
  `, null);
  // Set the first user to super_admin
  await run(`
    UPDATE users SET role = 'super_admin' WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
  `, "first user → super_admin");
  // Set workspace tier to enterprise for super admin's workspaces
  await run(`
    UPDATE workspaces SET
      tier = 'enterprise',
      project_limit = 999,
      run_limit = 99999,
      member_limit = 999,
      credit_balance = 999999,
      monthly_credits = 999999
    WHERE id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      JOIN users u ON u.id = wm.user_id
      WHERE u.role = 'super_admin'
    )
  `, "enterprise tier for superadmin workspaces");

  console.log("\n=== Schema sync complete ===");
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
