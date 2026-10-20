import { redirect } from "next/navigation";

export default function SettingsAgentsRedirect() {
  redirect("/dashboard/settings?tab=agents");
}
