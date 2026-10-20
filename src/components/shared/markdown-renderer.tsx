"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("prose-orbit", className)}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-base font-semibold text-foreground mt-4 mb-2 first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-sm font-semibold text-foreground mt-3 mb-1.5 first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-medium text-foreground mt-2.5 mb-1 first:mt-0">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="text-sm text-foreground leading-relaxed mb-2 last:mb-0">
            {children}
          </p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="text-muted-foreground">{children}</em>
        ),
        ul: ({ children }) => (
          <ul className="text-sm space-y-1 mb-2 ml-4 list-disc text-foreground">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="text-sm space-y-1 mb-2 ml-4 list-decimal text-foreground">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-sm leading-relaxed">{children}</li>
        ),
        code: ({ className: codeClass, children, ...props }) => {
          const isInline = !codeClass;
          if (isInline) {
            return (
              <code className="text-xs font-mono bg-foreground/[0.06] text-orbit-accent px-1.5 py-0.5 rounded">
                {children}
              </code>
            );
          }
          return (
            <code
              className={cn(
                "block text-xs font-mono bg-foreground/[0.04] border border-border rounded-lg p-3 mb-2 overflow-x-auto",
                codeClass
              )}
              {...props}
            >
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="mb-2">{children}</pre>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="text-xs w-full border-collapse">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-border">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="text-left px-3 py-1.5 text-muted-foreground font-medium text-[11px] uppercase tracking-wider">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-1.5 text-foreground border-b border-border">
            {children}
          </td>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orbit-accent hover:underline"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-orbit-accent/30 pl-3 ml-1 mb-2 text-muted-foreground">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-border my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
