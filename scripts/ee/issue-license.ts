/**
 * Dev tool, not part of the app. Issues an Orbit Enterprise license key (format in src/ee/license-key.ts).
 *
 *   npx tsx scripts/ee/issue-license.ts <private-key.pem> <licensee> <seats> <expiresAt ISO date>
 *
 * The private key stays outside the repo. Prints the key on stdout; warns on stderr when the key
 * would not verify against the official public key embedded in the app.
 */
import fs from "node:fs";
import path from "node:path";
import { createPrivateKey, sign } from "node:crypto";
import { EE_PUBLIC_KEY, verifyLicenseKey, type EeLicense } from "../../src/ee/license-key";

export function issueLicense(privateKeyPem: string, license: EeLicense): string {
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("private key must be Ed25519");
  const payload = Buffer.from(JSON.stringify(license)).toString("base64url");
  return `${payload}.${sign(null, Buffer.from(payload), privateKey).toString("base64url")}`;
}

export function parseLicenseArgs(args: string[]): { pemPath: string; license: EeLicense } {
  const [pemPath, licensee, seatsArg, expiresArg] = args;
  if (!pemPath || !licensee || !seatsArg || !expiresArg) {
    throw new Error("usage: issue-license.ts <private-key.pem> <licensee> <seats> <expiresAt>");
  }
  const seats = Number(seatsArg);
  if (!Number.isInteger(seats) || seats < 1) throw new Error(`seats must be a positive integer, got ${seatsArg}`);
  const expires = Date.parse(expiresArg);
  if (Number.isNaN(expires)) throw new Error(`expiresAt must be an ISO date, got ${expiresArg}`);
  return { pemPath, license: { licensee, seats, expiresAt: new Date(expires).toISOString() } };
}

if (process.argv[1] && path.basename(process.argv[1]) === "issue-license.ts") {
  try {
    const { pemPath, license } = parseLicenseArgs(process.argv.slice(2));
    const key = issueLicense(fs.readFileSync(pemPath, "utf8"), license);
    const check = verifyLicenseKey(key, EE_PUBLIC_KEY);
    if (!check.valid) console.error(`warning: this key does not verify against the official public key (${check.reason})`);
    console.log(key);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
