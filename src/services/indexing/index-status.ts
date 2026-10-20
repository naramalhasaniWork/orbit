import { prisma } from "@/lib/db";

/** A project counts as indexed once its system map has at least one node. */
export async function isProjectIndexed(projectId: string): Promise<boolean> {
  const nodes = await prisma.systemMapNode.count({ where: { projectId } });
  return nodes > 0;
}

export const INDEX_REQUIRED_MESSAGE =
  "Index the repository first. Plans and audits are built from the indexed code.";
