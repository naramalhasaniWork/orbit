import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { KnowledgeUpload } from "@/components/settings/knowledge-upload";

export default async function KnowledgeSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  if (!workspaceId) redirect("/login");

  const files = await prisma.domainKnowledgeFile.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      sizeBytes: true,
      chunkCount: true,
      createdAt: true,
    },
  });

  const serialized = files.map((f) => ({
    ...f,
    createdAt: f.createdAt.toISOString(),
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-balance text-[20px] font-medium leading-tight tracking-display">Knowledge Base</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload domain knowledge to give Orbit&apos;s agents deeper context about your application.
        </p>
      </div>
      <KnowledgeUpload workspaceId={workspaceId} initialFiles={serialized} />
    </div>
  );
}
