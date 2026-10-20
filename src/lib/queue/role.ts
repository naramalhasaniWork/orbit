export type OrbitRole = "all" | "web" | "worker";

/** ORBIT_ROLE selects which processes a container runs. Unknown values fall back to "all". */
export function getOrbitRole(env: NodeJS.ProcessEnv = process.env): OrbitRole {
  const raw = env.ORBIT_ROLE?.trim().toLowerCase();
  return raw === "web" || raw === "worker" ? raw : "all";
}

export function shouldStartWorkers(env: NodeJS.ProcessEnv = process.env): boolean {
  return getOrbitRole(env) !== "web";
}
