-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'archived', 'paused');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'indexing', 'planning', 'executing', 'reporting', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "RunMode" AS ENUM ('full', 'smoke', 'regression', 'targeted');

-- CreateEnum
CREATE TYPE "RunTrigger" AS ENUM ('push', 'pr', 'scheduled', 'manual', 'linear', 'api', 'deploy');

-- CreateEnum
CREATE TYPE "TestVerdict" AS ENUM ('pass', 'fail', 'flaky', 'skipped', 'healed');

-- CreateEnum
CREATE TYPE "TestType" AS ENUM ('journey', 'api_contract', 'auth', 'form_validation', 'edge_case', 'regression', 'visual_regression');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('owner', 'admin', 'member', 'viewer', 'billing');

-- CreateEnum
CREATE TYPE "WorkspaceTier" AS ENUM ('free', 'starter', 'professional', 'enterprise');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "SystemMapNodeType" AS ENUM ('route', 'component', 'endpoint', 'model', 'auth_strategy', 'middleware');

-- CreateEnum
CREATE TYPE "EnvironmentType" AS ENUM ('staging', 'preview', 'qa', 'production');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('healthy', 'degraded', 'failing');

-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('consumption', 'purchase', 'refund', 'monthly_grant', 'adjustment');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('screenshot', 'video', 'dom_snapshot', 'network_log', 'console_log');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('github', 'gitlab', 'linear', 'slack', 'railway');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('received', 'processing', 'processed', 'failed', 'ignored');

-- CreateEnum
CREATE TYPE "BaselineType" AS ENUM ('screenshot', 'api_response', 'dom_structure');

-- CreateEnum
CREATE TYPE "KnowledgeFileType" AS ENUM ('openapi', 'markdown', 'design_system', 'business_rules', 'test_credentials', 'other');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin', 'super_admin');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'past_due', 'canceled', 'trialing', 'incomplete', 'unpaid');

-- CreateEnum
CREATE TYPE "AgentPhase" AS ENUM ('analyst', 'planner', 'executor', 'reporter', 'auditor');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "tier" "WorkspaceTier" NOT NULL DEFAULT 'free',
    "credit_balance" INTEGER NOT NULL DEFAULT 100,
    "monthly_credits" INTEGER NOT NULL DEFAULT 100,
    "token_budget_monthly" INTEGER,
    "run_limit" INTEGER NOT NULL DEFAULT 100,
    "member_limit" INTEGER NOT NULL DEFAULT 2,
    "project_limit" INTEGER NOT NULL DEFAULT 1,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_price_id" TEXT,
    "billing_email" TEXT,
    "billing_period_start" TIMESTAMP(3),
    "billing_period_end" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "email_verified" TIMESTAMP(3),
    "github_id" TEXT,
    "github_access_token" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_invitations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'member',
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "invited_by" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_usage" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "runs_used" INTEGER NOT NULL DEFAULT 0,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "members_count" INTEGER NOT NULL DEFAULT 0,
    "projects_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_token")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "repo_url" TEXT NOT NULL,
    "repo_provider" TEXT NOT NULL DEFAULT 'github',
    "repo_owner" TEXT NOT NULL,
    "repo_name" TEXT NOT NULL,
    "default_branch" TEXT NOT NULL DEFAULT 'main',
    "framework" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "health_status" "HealthStatus" NOT NULL DEFAULT 'healthy',
    "last_indexed_at" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "config" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_runs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cron_expression" TEXT NOT NULL,
    "mode" "RunMode" NOT NULL DEFAULT 'smoke',
    "environment_id" UUID,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EnvironmentType" NOT NULL DEFAULT 'staging',
    "url" TEXT NOT NULL,
    "teardown_hook_url" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "source_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secrets" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "environment_id" UUID,
    "key" TEXT NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_map_nodes" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type" "SystemMapNodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding" vector(1536),
    "last_indexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_map_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_map_edges" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_node_id" UUID NOT NULL,
    "target_node_id" UUID NOT NULL,
    "relationship" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_map_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_plans" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "generated_by" TEXT NOT NULL DEFAULT 'planner',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" UUID NOT NULL,
    "test_plan_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TestType" NOT NULL,
    "journey" TEXT,
    "priority_score" INTEGER NOT NULL DEFAULT 50,
    "criticality" INTEGER NOT NULL DEFAULT 50,
    "risk" INTEGER NOT NULL DEFAULT 50,
    "coverage_gap" INTEGER NOT NULL DEFAULT 50,
    "steps" JSONB NOT NULL,
    "rationale" TEXT,
    "edge_cases" JSONB NOT NULL DEFAULT '[]',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_critical" BOOLEAN NOT NULL DEFAULT false,
    "last_verdict" "TestVerdict",
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_runs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "environment_id" UUID,
    "test_plan_id" UUID,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "mode" "RunMode" NOT NULL DEFAULT 'full',
    "trigger" "RunTrigger" NOT NULL DEFAULT 'manual',
    "triggered_by" UUID,
    "branch" TEXT,
    "commit_sha" TEXT,
    "pr_number" INTEGER,
    "total_tests" INTEGER NOT NULL DEFAULT 0,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "flaky" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "credits_consumed" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_results" (
    "id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "verdict" "TestVerdict" NOT NULL,
    "duration_ms" INTEGER,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "failure_explanation" TEXT,
    "suggested_fix" TEXT,
    "artifacts" JSONB NOT NULL DEFAULT '{}',
    "healed_selectors" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flaky_tests" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "pass_rate" DOUBLE PRECISION,
    "is_quarantined" BOOLEAN NOT NULL DEFAULT false,
    "last_flaky_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flaky_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selector_mappings" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "original_selector" TEXT NOT NULL,
    "healed_selector" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "heal_count" INTEGER NOT NULL DEFAULT 1,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selector_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status_code" INTEGER,
    "response" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "description" TEXT,
    "test_run_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "provider" "IntegrationProvider" NOT NULL,
    "event" TEXT NOT NULL,
    "external_id" TEXT,
    "payload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'received',
    "error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "stripe_subscription_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "price_id" TEXT NOT NULL,
    "tier" "WorkspaceTier" NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_usage" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cached_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DECIMAL(10,6) NOT NULL,
    "agent_phase" "AgentPhase" NOT NULL,
    "run_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_configs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "agent_phase" "AgentPhase" NOT NULL,
    "model" TEXT,
    "temperature" DOUBLE PRECISION,
    "max_input_tokens" INTEGER,
    "max_output_tokens" INTEGER,
    "custom_prompt" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_execution_traces" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "agent_phase" "AgentPhase" NOT NULL,
    "parent_trace_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'started',
    "model" TEXT,
    "temperature" DOUBLE PRECISION,
    "input_summary" TEXT,
    "output_summary" TEXT,
    "reasoning_steps" JSONB NOT NULL DEFAULT '[]',
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DECIMAL(10,6),
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "agent_execution_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "stripe_invoice_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL,
    "pdf_url" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" UUID NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_configs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_artifacts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "test_result_id" UUID,
    "type" "ArtifactType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT,
    "content_type" TEXT,
    "size_bytes" INTEGER,
    "step_index" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selector_history" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "selector_mapping_id" UUID NOT NULL,
    "previous_selector" TEXT NOT NULL,
    "new_selector" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "test_run_id" UUID,
    "page_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selector_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_case_versions" (
    "id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TestType" NOT NULL,
    "steps" JSONB NOT NULL,
    "rationale" TEXT,
    "changed_by" TEXT NOT NULL DEFAULT 'planner',
    "change_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_case_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_patterns" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "test_case_ids" JSONB NOT NULL DEFAULT '[]',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baseline_snapshots" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "type" "BaselineType" NOT NULL,
    "route_path" TEXT,
    "endpoint" TEXT,
    "storage_key" TEXT NOT NULL,
    "checksum" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "baseline_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_installations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plugin_name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "installed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_knowledge_files" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "KnowledgeFileType" NOT NULL DEFAULT 'other',
    "storage_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "embedding" vector(1536),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_knowledge_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL,
    "knowledge_file_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL DEFAULT '[]',
    "secret" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_metrics" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "total_workspaces" INTEGER NOT NULL DEFAULT 0,
    "total_users" INTEGER NOT NULL DEFAULT 0,
    "total_projects" INTEGER NOT NULL DEFAULT 0,
    "total_runs" INTEGER NOT NULL DEFAULT 0,
    "runs_today" INTEGER NOT NULL DEFAULT 0,
    "credits_consumed" INTEGER NOT NULL DEFAULT 0,
    "error_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_results" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "run_id" UUID,
    "overall_score" INTEGER NOT NULL,
    "categories" JSONB NOT NULL DEFAULT '{}',
    "issues" JSONB NOT NULL DEFAULT '[]',
    "issue_count" INTEGER NOT NULL DEFAULT 0,
    "critical_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_configs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "display_name" TEXT,
    "api_key_encrypted" TEXT,
    "base_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_registry" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "context_window" INTEGER NOT NULL,
    "input_cost_per_1m" DOUBLE PRECISION NOT NULL,
    "output_cost_per_1m" DOUBLE PRECISION NOT NULL,
    "capabilities" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_model_policies" (
    "id" UUID NOT NULL,
    "model_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "is_allowed" BOOLEAN NOT NULL DEFAULT true,
    "required_tier" TEXT,
    "max_temperature" DOUBLE PRECISION,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_model_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "agent_phase" "AgentPhase" NOT NULL,
    "prompt_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "changelog" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_connections" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "server_url" TEXT NOT NULL,
    "transport_type" TEXT NOT NULL DEFAULT 'sse',
    "api_key_encrypted" TEXT,
    "api_key_iv" TEXT,
    "headers" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "tools_discovered" JSONB,
    "last_connected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_stripe_customer_id_key" ON "workspaces"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_stripe_subscription_id_key" ON "workspaces"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_github_id_key" ON "users"("github_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_invitations_token_key" ON "workspace_invitations"("token");

-- CreateIndex
CREATE INDEX "workspace_invitations_workspace_id_idx" ON "workspace_invitations"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_invitations_email_idx" ON "workspace_invitations"("email");

-- CreateIndex
CREATE INDEX "workspace_invitations_token_idx" ON "workspace_invitations"("token");

-- CreateIndex
CREATE INDEX "workspace_usage_workspace_id_idx" ON "workspace_usage"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_usage_workspace_id_month_key" ON "workspace_usage"("workspace_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "projects_workspace_id_idx" ON "projects"("workspace_id");

-- CreateIndex
CREATE INDEX "projects_workspace_id_status_idx" ON "projects"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspace_id_slug_key" ON "projects"("workspace_id", "slug");

-- CreateIndex
CREATE INDEX "scheduled_runs_is_enabled_next_run_at_idx" ON "scheduled_runs"("is_enabled", "next_run_at");

-- CreateIndex
CREATE INDEX "scheduled_runs_project_id_idx" ON "scheduled_runs"("project_id");

-- CreateIndex
CREATE INDEX "environments_project_id_idx" ON "environments"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "secrets_project_id_environment_id_key_key" ON "secrets"("project_id", "environment_id", "key");

-- CreateIndex
CREATE INDEX "system_map_nodes_project_id_idx" ON "system_map_nodes"("project_id");

-- CreateIndex
CREATE INDEX "system_map_nodes_project_id_type_idx" ON "system_map_nodes"("project_id", "type");

-- CreateIndex
CREATE INDEX "system_map_nodes_project_id_file_path_idx" ON "system_map_nodes"("project_id", "file_path");

-- CreateIndex
CREATE INDEX "system_map_edges_project_id_idx" ON "system_map_edges"("project_id");

-- CreateIndex
CREATE INDEX "system_map_edges_source_node_id_idx" ON "system_map_edges"("source_node_id");

-- CreateIndex
CREATE INDEX "system_map_edges_target_node_id_idx" ON "system_map_edges"("target_node_id");

-- CreateIndex
CREATE INDEX "test_plans_project_id_idx" ON "test_plans"("project_id");

-- CreateIndex
CREATE INDEX "test_plans_project_id_is_active_idx" ON "test_plans"("project_id", "is_active");

-- CreateIndex
CREATE INDEX "test_cases_test_plan_id_idx" ON "test_cases"("test_plan_id");

-- CreateIndex
CREATE INDEX "test_cases_project_id_idx" ON "test_cases"("project_id");

-- CreateIndex
CREATE INDEX "test_cases_project_id_journey_idx" ON "test_cases"("project_id", "journey");

-- CreateIndex
CREATE INDEX "test_cases_project_id_is_critical_idx" ON "test_cases"("project_id", "is_critical");

-- CreateIndex
CREATE INDEX "test_runs_project_id_idx" ON "test_runs"("project_id");

-- CreateIndex
CREATE INDEX "test_runs_project_id_status_idx" ON "test_runs"("project_id", "status");

-- CreateIndex
CREATE INDEX "test_runs_project_id_created_at_idx" ON "test_runs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "test_runs_status_idx" ON "test_runs"("status");

-- CreateIndex
CREATE INDEX "test_results_test_run_id_idx" ON "test_results"("test_run_id");

-- CreateIndex
CREATE INDEX "test_results_test_run_id_verdict_idx" ON "test_results"("test_run_id", "verdict");

-- CreateIndex
CREATE INDEX "test_results_test_case_id_idx" ON "test_results"("test_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "flaky_tests_project_id_test_case_id_key" ON "flaky_tests"("project_id", "test_case_id");

-- CreateIndex
CREATE INDEX "selector_mappings_project_id_idx" ON "selector_mappings"("project_id");

-- CreateIndex
CREATE INDEX "selector_mappings_project_id_original_selector_idx" ON "selector_mappings"("project_id", "original_selector");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_idx" ON "audit_logs"("workspace_id");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_created_at_idx" ON "audit_logs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_project_id_idx" ON "webhook_deliveries"("project_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_project_id_event_idx" ON "webhook_deliveries"("project_id", "event");

-- CreateIndex
CREATE INDEX "credit_transactions_workspace_id_idx" ON "credit_transactions"("workspace_id");

-- CreateIndex
CREATE INDEX "credit_transactions_workspace_id_type_idx" ON "credit_transactions"("workspace_id", "type");

-- CreateIndex
CREATE INDEX "credit_transactions_workspace_id_created_at_idx" ON "credit_transactions"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_events_provider_event_idx" ON "webhook_events"("provider", "event");

-- CreateIndex
CREATE INDEX "webhook_events_project_id_idx" ON "webhook_events"("project_id");

-- CreateIndex
CREATE INDEX "webhook_events_status_idx" ON "webhook_events"("status");

-- CreateIndex
CREATE INDEX "webhook_events_created_at_idx" ON "webhook_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_workspace_id_idx" ON "subscriptions"("workspace_id");

-- CreateIndex
CREATE INDEX "token_usage_workspace_id_created_at_idx" ON "token_usage"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "token_usage_project_id_idx" ON "token_usage"("project_id");

-- CreateIndex
CREATE INDEX "token_usage_run_id_idx" ON "token_usage"("run_id");

-- CreateIndex
CREATE INDEX "agent_configs_workspace_id_idx" ON "agent_configs"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_configs_workspace_id_agent_phase_key" ON "agent_configs"("workspace_id", "agent_phase");

-- CreateIndex
CREATE INDEX "agent_execution_traces_run_id_idx" ON "agent_execution_traces"("run_id");

-- CreateIndex
CREATE INDEX "agent_execution_traces_run_id_agent_phase_idx" ON "agent_execution_traces"("run_id", "agent_phase");

-- CreateIndex
CREATE INDEX "agent_execution_traces_parent_trace_id_idx" ON "agent_execution_traces"("parent_trace_id");

-- CreateIndex
CREATE INDEX "agent_execution_traces_project_id_started_at_idx" ON "agent_execution_traces"("project_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_stripe_invoice_id_key" ON "invoices"("stripe_invoice_id");

-- CreateIndex
CREATE INDEX "invoices_workspace_id_idx" ON "invoices"("workspace_id");

-- CreateIndex
CREATE INDEX "invoices_workspace_id_created_at_idx" ON "invoices"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_events_stripe_event_id_key" ON "stripe_webhook_events"("stripe_event_id");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_stripe_event_id_idx" ON "stripe_webhook_events"("stripe_event_id");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_created_at_idx" ON "stripe_webhook_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "integration_configs_workspace_id_provider_key" ON "integration_configs"("workspace_id", "provider");

-- CreateIndex
CREATE INDEX "run_artifacts_test_run_id_idx" ON "run_artifacts"("test_run_id");

-- CreateIndex
CREATE INDEX "run_artifacts_test_result_id_idx" ON "run_artifacts"("test_result_id");

-- CreateIndex
CREATE INDEX "run_artifacts_project_id_type_idx" ON "run_artifacts"("project_id", "type");

-- CreateIndex
CREATE INDEX "selector_history_selector_mapping_id_idx" ON "selector_history"("selector_mapping_id");

-- CreateIndex
CREATE INDEX "selector_history_project_id_idx" ON "selector_history"("project_id");

-- CreateIndex
CREATE INDEX "test_case_versions_test_case_id_idx" ON "test_case_versions"("test_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_case_versions_test_case_id_version_key" ON "test_case_versions"("test_case_id", "version");

-- CreateIndex
CREATE INDEX "failure_patterns_project_id_idx" ON "failure_patterns"("project_id");

-- CreateIndex
CREATE INDEX "failure_patterns_project_id_category_idx" ON "failure_patterns"("project_id", "category");

-- CreateIndex
CREATE INDEX "failure_patterns_project_id_occurrences_idx" ON "failure_patterns"("project_id", "occurrences");

-- CreateIndex
CREATE INDEX "baseline_snapshots_project_id_idx" ON "baseline_snapshots"("project_id");

-- CreateIndex
CREATE INDEX "baseline_snapshots_project_id_type_idx" ON "baseline_snapshots"("project_id", "type");

-- CreateIndex
CREATE INDEX "baseline_snapshots_project_id_route_path_idx" ON "baseline_snapshots"("project_id", "route_path");

-- CreateIndex
CREATE INDEX "plugin_installations_workspace_id_idx" ON "plugin_installations"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_installations_workspace_id_plugin_name_key" ON "plugin_installations"("workspace_id", "plugin_name");

-- CreateIndex
CREATE INDEX "domain_knowledge_files_workspace_id_idx" ON "domain_knowledge_files"("workspace_id");

-- CreateIndex
CREATE INDEX "domain_knowledge_files_workspace_id_type_idx" ON "domain_knowledge_files"("workspace_id", "type");

-- CreateIndex
CREATE INDEX "knowledge_chunks_knowledge_file_id_idx" ON "knowledge_chunks"("knowledge_file_id");

-- CreateIndex
CREATE INDEX "knowledge_chunks_workspace_id_idx" ON "knowledge_chunks"("workspace_id");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_workspace_id_idx" ON "webhook_subscriptions"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE INDEX "platform_metrics_date_idx" ON "platform_metrics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "platform_metrics_date_key" ON "platform_metrics"("date");

-- CreateIndex
CREATE INDEX "audit_results_project_id_idx" ON "audit_results"("project_id");

-- CreateIndex
CREATE INDEX "audit_results_project_id_created_at_idx" ON "audit_results"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "provider_configs_workspace_id_idx" ON "provider_configs"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_configs_workspace_id_provider_key" ON "provider_configs"("workspace_id", "provider");

-- CreateIndex
CREATE INDEX "model_registry_provider_idx" ON "model_registry"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "model_registry_provider_model_id_key" ON "model_registry"("provider", "model_id");

-- CreateIndex
CREATE UNIQUE INDEX "global_model_policies_model_id_provider_key" ON "global_model_policies"("model_id", "provider");

-- CreateIndex
CREATE INDEX "prompt_versions_workspace_id_agent_phase_idx" ON "prompt_versions"("workspace_id", "agent_phase");

-- CreateIndex
CREATE INDEX "prompt_versions_agent_phase_is_active_idx" ON "prompt_versions"("agent_phase", "is_active");

-- CreateIndex
CREATE INDEX "mcp_connections_workspace_id_idx" ON "mcp_connections"("workspace_id");

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_usage" ADD CONSTRAINT "workspace_usage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_runs" ADD CONSTRAINT "scheduled_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_map_nodes" ADD CONSTRAINT "system_map_nodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_map_edges" ADD CONSTRAINT "system_map_edges_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_map_edges" ADD CONSTRAINT "system_map_edges_source_node_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "system_map_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_map_edges" ADD CONSTRAINT "system_map_edges_target_node_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "system_map_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_test_plan_id_fkey" FOREIGN KEY ("test_plan_id") REFERENCES "test_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_test_plan_id_fkey" FOREIGN KEY ("test_plan_id") REFERENCES "test_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_test_run_id_fkey" FOREIGN KEY ("test_run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flaky_tests" ADD CONSTRAINT "flaky_tests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flaky_tests" ADD CONSTRAINT "flaky_tests_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selector_mappings" ADD CONSTRAINT "selector_mappings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_execution_traces" ADD CONSTRAINT "agent_execution_traces_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_execution_traces" ADD CONSTRAINT "agent_execution_traces_parent_trace_id_fkey" FOREIGN KEY ("parent_trace_id") REFERENCES "agent_execution_traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_configs" ADD CONSTRAINT "integration_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_test_run_id_fkey" FOREIGN KEY ("test_run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_test_result_id_fkey" FOREIGN KEY ("test_result_id") REFERENCES "test_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selector_history" ADD CONSTRAINT "selector_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selector_history" ADD CONSTRAINT "selector_history_selector_mapping_id_fkey" FOREIGN KEY ("selector_mapping_id") REFERENCES "selector_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_versions" ADD CONSTRAINT "test_case_versions_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_patterns" ADD CONSTRAINT "failure_patterns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baseline_snapshots" ADD CONSTRAINT "baseline_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_installations" ADD CONSTRAINT "plugin_installations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_knowledge_files" ADD CONSTRAINT "domain_knowledge_files_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_file_id_fkey" FOREIGN KEY ("knowledge_file_id") REFERENCES "domain_knowledge_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_results" ADD CONSTRAINT "audit_results_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_configs" ADD CONSTRAINT "provider_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
