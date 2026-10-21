/** The running build: package version, plus the short commit when the host provides one (Railway). */
export function appVersion(): string {
  const version = process.env.npm_package_version ?? "0.1.0";
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7);
  return sha ? `${version}+${sha}` : version;
}
