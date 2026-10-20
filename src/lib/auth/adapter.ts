import type { Adapter, AdapterAccount } from "next-auth/adapters";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { encryptToken } from "@/lib/vault/token";

/**
 * Prisma adapter that encrypts provider tokens before they reach the accounts table.
 * Readers use decryptToken, which also accepts legacy plaintext rows; the jwt callback
 * rewrites a user's row encrypted on their next sign-in.
 */
export function createEncryptingAdapter(): Adapter {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    linkAccount: (account: AdapterAccount) =>
      base.linkAccount!({
        ...account,
        access_token: account.access_token ? encryptToken(account.access_token) : account.access_token,
        refresh_token: account.refresh_token ? encryptToken(account.refresh_token) : account.refresh_token,
      }),
  };
}
