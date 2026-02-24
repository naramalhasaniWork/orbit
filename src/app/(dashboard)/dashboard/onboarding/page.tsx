"use client";

import { useSearchParams } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");

  return (
    <div className="h-full">
      <OnboardingWizard initialProjectId={projectId} />
    </div>
  );
}
