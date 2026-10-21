import { HttpError } from "./errors";

function tooLarge(): HttpError {
  return new HttpError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
}

/**
 * Reads the body, refusing more than `maxBytes`. Content-Length is a promise, not a fact:
 * it must be present and within the cap, and the stream is counted as it arrives, so a body
 * that runs past the cap is cut off at the cap whatever the header said.
 * Throws HttpError 413 when the header is missing, malformed or over, or the stream runs over.
 */
export async function readCappedBody(req: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = req.headers.get("content-length");
  if (declared === null || !/^\d+$/.test(declared) || Number(declared) > maxBytes) throw tooLarge();
  if (!req.body) return new Uint8Array(0);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
