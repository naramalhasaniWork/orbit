import { describe, it, expect } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar, WorkspaceMark } from "@/components/ui/avatar";
import { avatarTone } from "@/lib/avatar/identity";

const render = <P extends object>(el: ComponentType<P>, props: P) => renderToStaticMarkup(createElement(el, props));

describe("Avatar", () => {
  it("shows the photo with the person's name as alt", () => {
    const html = render(Avatar, { name: "Ada Lovelace", email: "ada@x.io", image: "https://avatars.githubusercontent.com/u/1" });
    expect(html).toContain("<img");
    expect(html).toContain('alt="Ada Lovelace"');
    expect(html).toContain("object-cover");
  });

  it("has an empty alt when the name is written beside it", () => {
    const html = render(Avatar, { name: "Ada Lovelace", image: "https://avatars.githubusercontent.com/u/1", decorative: true });
    expect(html).toContain('alt=""');
    expect(html).not.toContain('title="');
  });

  it("serves the app's own route unoptimized, so the viewer's cookies reach it", () => {
    const html = render(Avatar, { name: "Ada", image: "/api/users/u-1/avatar?v=abc" });
    expect(html).toContain('src="/api/users/u-1/avatar?v=abc"');
    expect(html).not.toContain("/_next/image");
  });

  it("draws initials on the email's tone without a photo", () => {
    const html = render(Avatar, { name: "Ada Lovelace", email: "ada@x.io" });
    expect(html).not.toContain("<img");
    expect(html).toContain(">AL<");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Ada Lovelace"');
    expect(html).toContain(`--tm-avatar-${avatarTone("ada@x.io")}-bg`);
  });

  it("uses one letter at xs and a fixed square size per step", () => {
    expect(render(Avatar, { name: "Ada Lovelace", size: "xs" })).toContain(">A<");
    expect(render(Avatar, { name: "Ada", size: "xs" })).toContain("size-4");
    expect(render(Avatar, { name: "Ada", size: "md" })).toContain("size-7");
    expect(render(Avatar, { name: "Ada", size: "xl" })).toContain("size-16");
  });

  it("hides decorative initials from screen readers", () => {
    const html = render(Avatar, { email: "jane.doe@x.io", decorative: true });
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(">JD<");
  });
});

describe("WorkspaceMark", () => {
  it("is the workspace initial on the id's tone, or the org avatar", () => {
    expect(render(WorkspaceMark, { id: "ws-1", name: "acme labs" })).toContain(">A<");
    expect(render(WorkspaceMark, { id: "ws-1", name: "acme" })).toContain(`--tm-avatar-${avatarTone("ws-1")}-bg`);
    expect(render(WorkspaceMark, { id: "ws-1", name: "acme", image: "https://avatars.githubusercontent.com/u/9" })).toContain("<img");
  });
});

describe("Avatar image hosts", () => {
  it("loads a non-GitHub photo (GitLab, Gravatar) directly instead of throwing on an unlisted host", () => {
    const html = render(Avatar, { name: "Ada", image: "https://secure.gravatar.com/avatar/abc" });
    expect(html).toContain('src="https://secure.gravatar.com/avatar/abc"');
  });

  it("optimizes GitHub photos", () => {
    expect(render(Avatar, { name: "Ada", image: "https://avatars.githubusercontent.com/u/1" })).toContain("/_next/image");
  });
});
