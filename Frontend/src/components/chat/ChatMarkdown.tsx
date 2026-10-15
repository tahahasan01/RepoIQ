import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { cn } from "@/lib/utils";

/**
 * Markdown for assistant replies. Raw HTML in the reply is not rendered
 * (react-markdown escapes it unless rehype-raw is added, and it is not), and
 * react-markdown's default URL transform drops javascript: and data: links.
 */
const components: Components = {
  p: ({ children }) => <p className="leading-relaxed [&:not(:first-child)]:mt-3">{children}</p>,
  h1: ({ children }) => <h3 className="mt-4 first:mt-0 text-base font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 first:mt-0 text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 first:mt-0 text-sm font-semibold">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-3 first:mt-0 text-sm font-semibold">{children}</h4>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="font-medium text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-4 border-border" />,
  // Block code: the <code> inside is reset so it doesn't get the inline chip style.
  pre: ({ children }) => (
    <pre
      tabIndex={0}
      className="mt-3 overflow-x-auto rounded-md border border-border bg-muted/60 p-3 font-mono text-xs leading-relaxed [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[inherit]"
    >
      {children}
    </pre>
  ),
  code: ({ className, children }) => (
    <code className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]", className)}>{children}</code>
  ),
  table: ({ children }) => (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
};

export const ChatMarkdown = memo(function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="break-words text-sm">
      <ReactMarkdown components={components} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
});
