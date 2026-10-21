import type { NextResponse } from "next/server";
import { apiError } from "@/lib/utils/api";
import { isSelfHosted } from "@/lib/self-host";
import { hasEeFeature, type EeFeature, type EeSubject } from "./entitlement";

const FEATURE_NAMES: Record<EeFeature, string> = { audit_export: "Audit log export" };

/** A 402 response when the subject isn't entitled to the feature, otherwise null. */
export async function eeFeatureRequired(subject: EeSubject, feature: EeFeature): Promise<NextResponse | null> {
  if (await hasEeFeature(subject, feature)) return null;
  const message = isSelfHosted()
    ? `${FEATURE_NAMES[feature]} needs an Orbit Enterprise license (ORBIT_EE_LICENSE_KEY).`
    : `${FEATURE_NAMES[feature]} is available on the Team and Enterprise plans.`;
  return apiError(message, "EE_FEATURE_REQUIRED", 402);
}
