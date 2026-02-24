// ============================================================
// Error Classification for Self-Healing
// ============================================================

export type ErrorClass =
  | "selector_not_found"
  | "not_interactable"
  | "timeout"
  | "assertion"
  | "navigation"
  | "unknown";

export function classifyError(errorMsg: string): ErrorClass {
  const msg = errorMsg.toLowerCase();
  if (msg.includes("not found") || msg.includes("no element") || msg.includes("couldn't find")) {
    return "selector_not_found";
  }
  if (
    msg.includes("not interactable") ||
    msg.includes("not visible") ||
    msg.includes("disabled") ||
    msg.includes("obscured") ||
    msg.includes("intercepted")
  ) {
    return "not_interactable";
  }
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("waiting for")) {
    return "timeout";
  }
  if (
    msg.includes("expect") ||
    msg.includes("assert") ||
    msg.includes("does not contain") ||
    msg.includes("does not match")
  ) {
    return "assertion";
  }
  if (msg.includes("navigat") || msg.includes("redirect") || msg.includes("detached")) {
    return "navigation";
  }
  return "unknown";
}
