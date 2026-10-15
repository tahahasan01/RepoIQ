/**
 * The URL if it is an absolute http(s) URL, otherwise "".
 *
 * For links whose target comes from untrusted text (model output, or data a
 * model or a third party produced): javascript:, data:, vbscript:, file: and
 * relative URLs are all refused.
 */
export function safeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return ""; // relative or malformed
  }
}
