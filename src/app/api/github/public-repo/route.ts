import { NextRequest } from "next/server";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { fetchPublicRepo, parseGitHubRepoUrl } from "@/lib/github/public-repo";

export const dynamic = "force-dynamic";

// GET /api/github/public-repo?url=https://github.com/owner/repo
// Looks up a public repository without the user's GitHub token or the GitHub App.
export async function GET(request: NextRequest) {
  try {
    await requireWorkspace();

    const ref = parseGitHubRepoUrl(request.nextUrl.searchParams.get("url") ?? "");
    if (!ref) {
      return apiError(
        "Enter a GitHub repository link like https://github.com/owner/repo.",
        "INVALID_URL",
        400
      );
    }

    // GITHUB_TOKEN is optional; it only raises the rate limit for this public lookup.
    const result = await fetchPublicRepo(ref.owner, ref.repo, fetch, process.env.GITHUB_TOKEN);
    if (result.ok) return apiSuccess(result.repo);

    if (result.code === "RATE_LIMITED") {
      const res = apiError(result.message, "RATE_LIMITED", 429);
      if (result.retryAt) {
        const seconds = Math.max(1, Math.ceil((result.retryAt.getTime() - Date.now()) / 1000));
        res.headers.set("Retry-After", String(seconds));
      }
      return res;
    }
    return apiError(result.message, result.code, result.code === "NOT_FOUND" ? 404 : 502);
  } catch (error) {
    return handleApiError(error);
  }
}
