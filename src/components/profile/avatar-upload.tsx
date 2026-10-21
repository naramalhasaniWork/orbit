"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { useSession } from "next-auth/react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp";

/** Your photo with Upload / Remove. The server re-checks everything; this only saves a round trip. */
export function AvatarUpload() {
  const { data: session, update } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const user = session?.user;
  const image = user?.image ?? null;
  const hasUpload = Boolean(image?.startsWith("/api/users/"));

  async function send(method: "POST" | "DELETE", body?: FormData) {
    const res = await fetch("/api/user/avatar", { method, body });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message ?? "Could not update your photo.");
    await update({ avatar: true });
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!ACCEPT.split(",").includes(file.type)) return setError("Use a PNG, JPEG or WebP image.");
    if (file.size > MAX_BYTES) return setError("The image is over 2 MB.");
    const form = new FormData();
    form.append("file", file);
    setBusy("upload");
    try {
      await send("POST", form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload your photo.");
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
    setError(null);
    setBusy("remove");
    try {
      await send("DELETE");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove your photo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={user?.name} email={user?.email} image={image} size="xl" decorative />
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            aria-busy={busy === "upload" || undefined}
            aria-describedby={statusId}
            onClick={() => inputRef.current?.click()}
          >
            {busy === "upload" ? "Uploading…" : hasUpload ? "Replace photo" : "Upload photo"}
          </Button>
          {hasUpload && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              aria-busy={busy === "remove" || undefined}
              onClick={onRemove}
            >
              {busy === "remove" ? "Removing…" : "Remove photo"}
            </Button>
          )}
        </div>
        <p id={statusId} aria-live="polite" className={error ? "text-[12px] text-tm-fail" : "tm-label text-tm-t3"}>
          {error ?? (hasUpload ? "Your upload · removing it shows your GitHub photo" : "PNG, JPEG or WebP · up to 2 MB")}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onPick}
        />
      </div>
    </div>
  );
}
