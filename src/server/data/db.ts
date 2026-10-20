import type { Prisma } from "@/generated/prisma/client";

/** A client or an open transaction; every repo function takes one (default: the shared client). */
export type Db = Prisma.TransactionClient;

export { prisma as defaultDb } from "@/lib/db";
