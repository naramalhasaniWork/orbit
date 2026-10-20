import type { Prisma } from "@/generated/prisma/client";

/** A client or an open transaction; every repo function takes one (default: the shared client). */
export type Db = Prisma.TransactionClient;

export { prisma as defaultDb } from "@/lib/db";

/** Run inside the caller's transaction when given one, else open a new one. */
export async function withTransaction<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  const client = db as Db & { $transaction?: (fn: (tx: Db) => Promise<T>) => Promise<T> };
  return typeof client.$transaction === "function" ? client.$transaction(fn) : fn(db);
}
