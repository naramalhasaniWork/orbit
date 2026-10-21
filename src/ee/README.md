# Orbit Enterprise (`src/ee/`)

Code in this directory is under the [Orbit Enterprise License](./LICENSE), not the AGPL-3.0 that covers the rest of Orbit. Development and testing are free; production use needs a subscription and a license key.

Self-hosting the AGPL core is free and needs no key. On a self-hosted install, enterprise features stay off until a valid key is set; on hosted Orbit they come with the Team and Enterprise plans.

## Features

| Feature | Status | Gate |
|---|---|---|
| Audit log CSV export (workspace and admin) | Shipped | `GET .../audit-logs?format=csv` returns 402 when not entitled |
| SSO / SAML | Not built | |
| SCIM provisioning | Not built | |
| Multi-client agency workspaces, white-label reports | Not built | |

Viewing the audit log in the app stays free; only the export is gated.

## Who gets them

- **Hosted Orbit:** by workspace plan. Team (`professional`) and Enterprise include every current ee feature (`EE_FEATURE_TIERS` in `entitlement.ts`). Operator-level views with no workspace (the super-admin audit log) are always on. License keys are not consulted.
- **Self-hosted** (`ORBIT_SELF_HOSTED=true`): by license key only; workspace plans don't apply.
- **Local development** (`NODE_ENV=development`): always on.

## License keys

A key is `base64url(payload).base64url(signature)`: the payload is JSON `{ "licensee", "seats", "expiresAt" }` and the signature is Ed25519 over the payload segment. `src/ee/license-key.ts` verifies it offline; nothing calls home.

Set `ORBIT_EE_LICENSE_KEY` to the key issued with a subscription. It is checked against the official public key embedded in `license-key.ts` (`EE_PUBLIC_KEY`); deployments can't swap in their own. `ORBIT_EE_PUBLIC_KEY` overrides it only under `NODE_ENV=test`.

The owner issues keys with `npx tsx scripts/ee/issue-license.ts <private-key.pem> <licensee> <seats> <expiresAt>`. The private key never enters the repo.

## Adding a feature

Put the code under `src/ee/`, add the feature and its hosted plans to `EE_FEATURE_TIERS`, and gate its entry point with `eeFeatureRequired(subject, feature)` from `src/ee/require-feature.ts` (API routes) or `hasEeFeature()` from `src/ee/entitlement.ts` (anything else). Gating an existing core feature is an owner decision.
