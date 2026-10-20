import { redirect } from "next/navigation";

export default function SettingsPluginsRedirect() {
  redirect("/dashboard/settings?tab=plugins");
}
