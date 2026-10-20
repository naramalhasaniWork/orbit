import { redirect } from "next/navigation";

export default function SettingsAuditRedirect() {
  redirect("/dashboard/settings?tab=audit");
}
