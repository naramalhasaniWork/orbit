import { NextResponse } from "next/server";
import { requireAuth, apiSuccess, handleApiError } from "@/lib/utils/api";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await requireAuth();

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        createdAt: true,
        accounts: {
          select: { provider: true },
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: "User not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id, workspaceId: session.workspaceId, workspace: { deletedAt: null } },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            tier: true,
          },
        },
      },
    });

    return apiSuccess({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      platformRole: user.role,
      createdAt: user.createdAt.toISOString(),
      provider: user.accounts[0]?.provider ?? null,
      workspace: membership
        ? {
            id: membership.workspace.id,
            name: membership.workspace.name,
            slug: membership.workspace.slug,
            tier: membership.workspace.tier,
            role: membership.role,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
