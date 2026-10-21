import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  workspaceMember: { findFirst: vi.fn() },
}));
const storage = vi.hoisted(() => ({
  upload: vi.fn(async () => undefined),
  download: vi.fn(async () => Buffer.from("webp-bytes")),
  remove: vi.fn(async () => undefined),
}));
const counts = vi.hoisted(() => new Map<string, number>());
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    multi: () => {
      let key = "";
      const chain = {
        incr: (k: string) => {
          key = k;
          counts.set(k, (counts.get(k) ?? 0) + 1);
          return chain;
        },
        ttl: () => chain,
        exec: async () => [[null, counts.get(key)], [null, 3600]],
      };
      return chain;
    },
    expire: vi.fn(),
  }),
}));
vi.mock("@/lib/storage", () => ({ getStorage: () => storage }));
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);

import { NextRequest } from "next/server";
import { POST, DELETE } from "@/app/api/user/avatar/route";
import { GET } from "@/app/api/users/[userId]/avatar/route";
import { resetRouteAuth, routeAuth } from "../helpers/route-auth";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const OLD_KEY = `avatars/${ME}/0123456789abcdef.webp`;

let row: { id: string; image: string | null; avatarKey: string | null };

beforeEach(() => {
  vi.clearAllMocks();
  counts.clear();
  resetRouteAuth();
  routeAuth.userId = ME;
  row = { id: ME, image: "https://avatars.githubusercontent.com/u/1", avatarKey: null };
  db.user.findUnique.mockImplementation(async () => ({ ...row }));
  db.user.update.mockImplementation(async ({ data }: { data: { avatarKey: string | null } }) => {
    row.avatarKey = data.avatarKey;
    return row;
  });
  db.workspaceMember.findFirst.mockResolvedValue(null);
});

const png = (w = 400, h = 300) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 160, g: 90, b: 60 } } }).png().toBuffer();

/** Encodes the multipart body the way a browser would, Content-Length included unless overridden. */
async function multipart(bytes: Uint8Array, type: string, name = "me.png") {
  const form = new FormData();
  form.append("file", new File([Uint8Array.from(bytes)], name, { type }));
  const encoded = new Request("http://localhost", { method: "POST", body: form });
  return { body: new Uint8Array(await encoded.arrayBuffer()), contentType: encoded.headers.get("content-type")! };
}

function post(body: BodyInit, headers: Record<string, string>) {
  return POST(
    new NextRequest("http://localhost/api/user/avatar", { method: "POST", body, headers, duplex: "half" } as ConstructorParameters<
      typeof NextRequest
    >[1])
  );
}

async function upload(bytes: Uint8Array, type: string, name = "me.png") {
  const { body, contentType } = await multipart(bytes, type, name);
  return post(Uint8Array.from(body), { "content-type": contentType, "content-length": String(body.byteLength) });
}

/** A body that streams `size` bytes whatever the headers claim. */
function stream(size: number) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (let sent = 0; sent < size; sent += 64 * 1024) c.enqueue(new Uint8Array(Math.min(64 * 1024, size - sent)));
      c.close();
    },
  });
}

const get = (userId: string, headers: Record<string, string> = {}) =>
  GET(new NextRequest(`http://localhost/api/users/${userId}/avatar`, { headers }), { params: Promise.resolve({ userId }) });

describe("POST /api/user/avatar", () => {
  it("stores a 256×256 WebP and points the user at it", async () => {
    const res = await upload(await png(), "image/png");
    expect(res.status).toBe(200);
    const [key, data, type] = storage.upload.mock.calls[0] as unknown as [string, Buffer, string];
    expect(key).toMatch(new RegExp(`^avatars/${ME}/[0-9a-f]{16}\\.webp$`));
    expect(type).toBe("image/webp");
    const meta = await sharp(data).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 256, 256]);
    expect(row.avatarKey).toBe(key);
    const json = await res.json();
    expect(json.data.image).toBe(`/api/users/${ME}/avatar?v=${key.split("/")[2].replace(".webp", "")}`);
  });

  it("deletes the photo it replaces", async () => {
    row.avatarKey = OLD_KEY;
    await upload(await png(), "image/png");
    expect(storage.remove).toHaveBeenCalledWith(OLD_KEY);
  });

  it("rejects a type it does not accept", async () => {
    const res = await upload(new TextEncoder().encode("GIF89a...."), "image/gif", "x.gif");
    expect(res.status).toBe(415);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejects a file over 2 MB", async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await upload(big, "image/png");
    expect(res.status).toBe(413);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("413s without a Content-Length, before reading the body", async () => {
    const { body, contentType } = await multipart(await png(), "image/png");
    const res = await post(stream(body.byteLength), { "content-type": contentType });
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("413s on a malformed Content-Length", async () => {
    const { body, contentType } = await multipart(await png(), "image/png");
    const res = await post(Uint8Array.from(body), { "content-type": contentType, "content-length": "1e3" });
    expect(res.status).toBe(413);
  });

  it("413s when the body runs past a Content-Length that lied", async () => {
    const res = await post(stream(8 * 1024 * 1024), { "content-type": "multipart/form-data; boundary=x", "content-length": "1000" });
    expect(res.status).toBe(413);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("429s the 11th upload in an hour, per user", async () => {
    const image = await png(64, 64);
    for (let i = 0; i < 10; i++) expect((await upload(image, "image/png")).status).toBe(200);
    const limited = await upload(image, "image/png");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();

    routeAuth.userId = OTHER;
    row = { id: OTHER, image: null, avatarKey: null };
    expect((await upload(image, "image/png")).status).toBe(200);
  });

  it("rejects bytes that are not the image they claim to be", async () => {
    const html = new TextEncoder().encode("<svg onload=alert(1)>");
    const res = await upload(html, "image/png");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_IMAGE");
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejects a valid header on a corrupt body", async () => {
    const res = await upload(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), "image/jpeg");
    expect(res.status).toBe(400);
    expect(storage.upload).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/user/avatar", () => {
  it("clears the upload, deletes it, and falls back to the GitHub photo", async () => {
    row.avatarKey = OLD_KEY;
    const res = await DELETE(new NextRequest("http://localhost/api/user/avatar", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(row.avatarKey).toBeNull();
    expect(storage.remove).toHaveBeenCalledWith(OLD_KEY);
    expect((await res.json()).data.image).toBe("https://avatars.githubusercontent.com/u/1");
  });

  it("falls back to initials (null) without a GitHub photo", async () => {
    row = { id: ME, image: null, avatarKey: OLD_KEY };
    const res = await DELETE(new NextRequest("http://localhost/api/user/avatar", { method: "DELETE" }));
    expect((await res.json()).data.image).toBeNull();
  });
});

describe("GET /api/users/[userId]/avatar", () => {
  beforeEach(() => {
    row = { id: OTHER, image: null, avatarKey: `avatars/${OTHER}/feedfacecafebeef.webp` };
  });

  it("404s for a stranger without touching storage", async () => {
    const res = await get(OTHER);
    expect(res.status).toBe(404);
    expect(storage.download).not.toHaveBeenCalled();
    expect(db.workspaceMember.findFirst.mock.calls[0][0].where).toEqual({
      userId: OTHER,
      workspace: { deletedAt: null, members: { some: { userId: ME } } },
    });
  });

  it("serves the photo to someone sharing a workspace, with an ETag", async () => {
    db.workspaceMember.findFirst.mockResolvedValue({ id: "m-1" });
    const res = await get(OTHER);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("ETag")).toBe('"feedfacecafebeef"');
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=86400");
  });

  it("answers 304 when the ETag matches", async () => {
    db.workspaceMember.findFirst.mockResolvedValue({ id: "m-1" });
    const res = await get(OTHER, { "if-none-match": '"feedfacecafebeef"' });
    expect(res.status).toBe(304);
    expect(storage.download).not.toHaveBeenCalled();
  });

  it("serves your own photo", async () => {
    row = { id: ME, image: null, avatarKey: OLD_KEY };
    const res = await get(ME);
    expect(res.status).toBe(200);
    expect(db.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it("404s when the user has no uploaded photo", async () => {
    db.workspaceMember.findFirst.mockResolvedValue({ id: "m-1" });
    row.avatarKey = null;
    expect((await get(OTHER)).status).toBe(404);
  });
});
