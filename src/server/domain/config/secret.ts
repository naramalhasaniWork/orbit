import { z } from "zod";

/** A vault-sealed secret as stored in JSON columns ({encrypted, iv}). */
export const SealedSecretSchema = z.object({ encrypted: z.string(), iv: z.string() });
export type SealedSecretValue = z.infer<typeof SealedSecretSchema>;

/** Pre-W3 settings hold either a sealed payload or legacy plaintext. */
export const StoredSecretSchema = z.union([z.string(), SealedSecretSchema]);
