/** Domain errors any layer may throw; the route wrapper maps them to HTTP (server/http/map-error.ts). */

export class NotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
