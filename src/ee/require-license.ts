import type { NextResponse } from "next/server";
import { apiError } from "@/lib/utils/api";
import { hasEeLicense } from "./license-key";

/** A 402 response when no valid Enterprise license is configured, otherwise null. */
export function eeLicenseRequired(feature: string): NextResponse | null {
  if (hasEeLicense()) return null;
  return apiError(`${feature} needs an Orbit Enterprise license (ORBIT_EE_LICENSE_KEY).`, "EE_LICENSE_REQUIRED", 402);
}
