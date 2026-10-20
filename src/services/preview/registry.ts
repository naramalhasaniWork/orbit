import { PREVIEW_PROVIDER_IDS, type PreviewProvider, type PreviewProviderId } from "./types";
import { railwayProvider } from "./providers/railway";
import { cloudflarePagesProvider } from "./providers/cloudflare-pages";

const PROVIDERS: Record<PreviewProviderId, PreviewProvider> = {
  [PREVIEW_PROVIDER_IDS.railway]: railwayProvider,
  [PREVIEW_PROVIDER_IDS.cloudflarePages]: cloudflarePagesProvider,
};

export function isPreviewProviderId(value: string): value is PreviewProviderId {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

export function getPreviewProvider(id: string): PreviewProvider | null {
  return isPreviewProviderId(id) ? PROVIDERS[id] : null;
}
