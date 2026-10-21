"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { avatarTone, avatarToneStyle, initialsFor } from "@/lib/avatar/identity";

const SIZES = {
  xs: { px: 16, box: "size-4 rounded-[3px] text-[7.5px]", letters: 1 },
  sm: { px: 20, box: "size-5 rounded-sm text-[8px]", letters: 2 },
  md: { px: 28, box: "size-7 rounded-sm text-[10px]", letters: 2 },
  lg: { px: 40, box: "size-10 rounded-lg text-[13px]", letters: 2 },
  xl: { px: 64, box: "size-16 rounded-xl text-[20px]", letters: 2 },
} as const;

export type AvatarSize = keyof typeof SIZES;

/**
 * Only GitHub photos go through the optimizer (next.config remotePatterns). Our own
 * /api/users/… route needs the viewer's cookies, which the optimizer would not send,
 * and any other host (GitLab, Gravatar) would throw for an unlisted hostname.
 */
function isOptimizable(src: string): boolean {
  return src.startsWith("https://avatars.githubusercontent.com/");
}

interface FrameProps {
  seed: string;
  initials: string;
  image: string | null | undefined;
  size: AvatarSize;
  /** Accessible name; empty when the name is already written beside the mark. */
  label: string;
  className?: string;
}

/**
 * Fixed-size square-ish frame: the photo when it loads, else initials on the seed's tone.
 * A broken URL falls back to initials in place; the box never changes size.
 */
function AvatarFrame({ seed, initials, image, size, label, className }: FrameProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const spec = SIZES[size];
  const showImage = Boolean(image) && failedSrc !== image;

  return (
    <span
      role={showImage || !label ? undefined : "img"}
      aria-label={showImage || !label ? undefined : label}
      aria-hidden={!showImage && !label ? true : undefined}
      title={label || undefined}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-label font-medium leading-none tracking-normal",
        spec.box,
        showImage && "bg-tm-sunken",
        className
      )}
      style={showImage ? undefined : avatarToneStyle(avatarTone(seed))}
    >
      {showImage && image ? (
        <Image
          src={image}
          alt={label}
          width={spec.px}
          height={spec.px}
          unoptimized={!isOptimizable(image)}
          onError={() => setFailedSrc(image)}
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-tm-t1/10" />
    </span>
  );
}

export interface AvatarProps {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  size?: AvatarSize;
  /** Set when the name is written next to the avatar, so screen readers do not hear it twice. */
  decorative?: boolean;
  className?: string;
}

/** A person: their photo (uploaded, then GitHub) or initials on a stable colour. */
export function Avatar({ name, email, image, size = "md", decorative = false, className }: AvatarProps) {
  const letters = SIZES[size].letters === 1 ? 1 : 2;
  return (
    <AvatarFrame
      seed={email || name || ""}
      initials={initialsFor(name, email, letters)}
      image={image}
      size={size}
      label={decorative ? "" : name || email || ""}
      className={className}
    />
  );
}

export interface WorkspaceMarkProps {
  id: string;
  name: string;
  /** The GitHub org avatar when the workspace has an installation. */
  image?: string | null;
  size?: AvatarSize;
  className?: string;
}

/** A workspace: its GitHub org avatar, else its initial on the workspace's colour. Always beside its name. */
export function WorkspaceMark({ id, name, image, size = "sm", className }: WorkspaceMarkProps) {
  return (
    <AvatarFrame seed={id} initials={initialsFor(name, null, 1)} image={image} size={size} label="" className={className} />
  );
}
