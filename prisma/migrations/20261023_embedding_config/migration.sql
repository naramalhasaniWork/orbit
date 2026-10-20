-- W6: provider-agnostic embeddings, keyword search fallback, cache-write accounting.
-- Must apply after 20261022_preview_deployments.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- The fixed-dimension HNSW index blocks the type change; the app rebuilds it per install
-- as an expression index on embedding::vector(<dims>) (see src/lib/db/vector.ts).
DROP INDEX IF EXISTS "system_map_nodes_embedding_hnsw_idx";

-- Unconstrained vectors: any embedding provider's dimension fits. Existing values keep
-- their data (vector(1536) -> vector is a no-op cast).
ALTER TABLE "system_map_nodes" ALTER COLUMN "embedding" TYPE vector;
ALTER TABLE "domain_knowledge_files" ALTER COLUMN "embedding" TYPE vector;
ALTER TABLE "knowledge_chunks" ALTER COLUMN "embedding" TYPE vector;

CREATE TABLE "embedding_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embedding_config_pkey" PRIMARY KEY ("id")
);

-- Vectors written before this migration all came from OpenAI text-embedding-3-small.
INSERT INTO "embedding_config" ("id", "provider", "model", "dimensions")
SELECT 'default', 'openai', 'text-embedding-3-small', 1536
WHERE EXISTS (SELECT 1 FROM "system_map_nodes" WHERE "embedding" IS NOT NULL)
   OR EXISTS (SELECT 1 FROM "knowledge_chunks" WHERE "embedding" IS NOT NULL);

ALTER TABLE "token_usage" ADD COLUMN "cache_creation_tokens" INTEGER NOT NULL DEFAULT 0;
