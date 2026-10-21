# Orbit Enterprise (`src/ee/`)

Code in this directory is under the [Orbit Enterprise License](./LICENSE), not the AGPL-3.0 that covers the rest of Orbit. Development and testing are free; production use needs a subscription and a license key.

Self-hosting the AGPL core is free and needs no key. Enterprise features stay off until a valid key is set.

## Features

| Feature | Status | Gate |
|---|---|---|
| Audit log CSV export (workspace and admin) | Shipped | `GET .../audit-logs?format=csv` returns 402 without a key |
| SSO / SAML | Not built | |
| SCIM provisioning | Not built | |
| Multi-client agency workspaces, white-label reports | Not built | |

Viewing the audit log in the app stays free; only the export is gated.

## License keys

A key is `base64url(payload).base64url(signature)`: the payload is JSON `{ "licensee", "seats", "expiresAt" }` and the signature is Ed25519 over the payload segment. `src/ee/license-key.ts` verifies it offline; nothing calls home.

| Env var | Purpose |
|---|---|
| `ORBIT_EE_LICENSE_KEY` | The key issued with a subscription |
| `ORBIT_EE_PUBLIC_KEY` | Base64 raw 32-byte Ed25519 public key that signed it |

With `NODE_ENV=development` every enterprise feature is on, so local work needs no key.

## Adding a feature

Put the code under `src/ee/`, and gate its entry point with `eeLicenseRequired("Feature name")` from `src/ee/require-license.ts` (API routes) or `hasEeLicense()` from `src/ee/license-key.ts` (anything else). Gating an existing core feature is an owner decision.
