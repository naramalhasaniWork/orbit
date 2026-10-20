/**
 * Client-safe description of each preview provider, used to render the Integrations cards and
 * the project's "Preview source" section. No server imports here.
 */
export interface ProviderField {
  name: "token" | "accountId";
  label: string;
  type: "password" | "text";
  placeholder: string;
  help: string;
}

export interface PreviewProviderInfo {
  id: "railway" | "cloudflare_pages";
  name: string;
  description: string;
  fields: ProviderField[];
  /** The provider can push deployment webhooks (shown as "copy this URL and token") */
  usesWebhook: boolean;
  /** Hosts a preview URL may live on unless the project adds its own */
  defaultHostSuffixes: string[];
  targetNoun: string;
}

export const PREVIEW_PROVIDER_CATALOG: PreviewProviderInfo[] = [
  {
    id: "railway",
    name: "Railway",
    description: "Test each PR environment Railway deploys",
    fields: [
      {
        name: "token",
        label: "Workspace token",
        type: "password",
        placeholder: "Railway workspace token",
        help: "Railway → Account settings → Tokens → create a token scoped to the workspace that owns your project.",
      },
    ],
    usesWebhook: true,
    defaultHostSuffixes: ["up.railway.app"],
    targetNoun: "Railway service",
  },
  {
    id: "cloudflare_pages",
    name: "Cloudflare Pages",
    description: "Test each PR's Pages preview deployment",
    fields: [
      {
        name: "accountId",
        label: "Account ID",
        type: "text",
        placeholder: "32-character account ID",
        help: "Shown in the Cloudflare dashboard sidebar under Account ID.",
      },
      {
        name: "token",
        label: "API token",
        type: "password",
        placeholder: "Cloudflare API token",
        help: "My Profile → API Tokens → Create token with Account › Cloudflare Pages › Read.",
      },
    ],
    usesWebhook: false,
    defaultHostSuffixes: ["pages.dev"],
    targetNoun: "Pages project",
  },
];

export function providerInfo(id: string): PreviewProviderInfo | undefined {
  return PREVIEW_PROVIDER_CATALOG.find((p) => p.id === id);
}
