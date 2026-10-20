import type { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/utils/api";
import { UnsafeUrlError } from "@/lib/utils/ssrf";
import { isPreviewProviderId } from "./registry";
import { PreviewProviderError, type PreviewProviderId } from "./types";

/** Provider errors carry a user-facing message; null means "not a preview error". Used as route()'s onError. */
export function mapPreviewError(error: unknown): NextResponse | null {
  if (error instanceof PreviewProviderError) return apiError(error.message, "PROVIDER_ERROR", 400);
  if (error instanceof UnsafeUrlError) return apiError(error.message, "UNSAFE_URL", 400);
  return null;
}

/** For routes not yet on route(): preview errors, else the standard mapping. */
export function previewApiError(error: unknown): NextResponse {
  return mapPreviewError(error) ?? handleApiError(error);
}

export function parseProviderParam(value: string): PreviewProviderId | null {
  return isPreviewProviderId(value) ? value : null;
}
