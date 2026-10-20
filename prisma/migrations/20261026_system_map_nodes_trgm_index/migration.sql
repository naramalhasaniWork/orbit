-- Keyword-search index that lib/db/vector.ts already creates at startup. Declared in the
-- schema now, so this migration records it (IF NOT EXISTS: existing databases have it).
CREATE INDEX IF NOT EXISTS "system_map_nodes_name_trgm_idx" ON "system_map_nodes" USING GIN ("name" gin_trgm_ops);
