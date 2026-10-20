import { notFound } from "next/navigation";

// No published content yet: respond 404 rather than show a placeholder.
export default function Page() {
  notFound();
}
