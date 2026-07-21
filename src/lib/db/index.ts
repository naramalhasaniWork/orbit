import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  // Railway's proxy can be slow to accept new connections; 2s caused
  // "Connection terminated due to connection timeout" on scheduler ticks
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on("error", (err) => {
  // Idle clients dropped server-side (ECONNRESET) are routine in
  // long-lived workers — the pool replaces them on next checkout.
  // Without this handler each drop surfaces as an unhandled error.
  console.warn("[db] Idle pool connection error:", err.message);
});

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient };
