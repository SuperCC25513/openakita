export type WorkspaceFile = {
  name: string;
  path: string;
  url: string;
  kind: "image" | "html" | "other";
};

/** Only intercept our backend's workspace paths and existing file API links. */
export function resolveWorkspaceFile(
  href: string,
  apiBaseUrl = "",
  conversationId?: string,
): WorkspaceFile | null {
  try {
    const base = new URL(apiBaseUrl || window.location.origin);
    const target = new URL(href, base);
    if (!/^https?:$/.test(target.protocol) || target.origin !== base.origin) return null;

    let path: string;
    if (target.pathname.startsWith("/workspace/")) {
      path = decodeURIComponent(target.pathname);
    } else if (target.pathname === "/api/files") {
      path = target.searchParams.get("path") || "";
    } else {
      return null;
    }
    if (!path || path.endsWith("/") || /[\x00-\x1f]/.test(path)) return null;
    const name = path.split(/[\\/]/).pop() || path;
    const ext = name.split(".").pop()?.toLowerCase();
    const kind = ext === "html" || ext === "htm" ? "html"
      : /^(png|jpe?g|webp|gif|bmp|avif|svg)$/.test(ext || "") ? "image" : "other";
    const params = new URLSearchParams({ path });
    const scope = conversationId || target.searchParams.get("conversation_id");
    if (scope) params.set("conversation_id", scope);
    // Build a clean URL; never copy token/query credentials from model output.
    return { name, path, kind, url: `${apiBaseUrl.replace(/\/$/, "")}/api/files?${params}` };
  } catch {
    return null;
  }
}

/** The early CSP cannot be relaxed by a later meta tag in generated content. */
export function isolatedHtmlDocument(html: string): string {
  return `<!doctype html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><meta name="referrer" content="no-referrer"><script>addEventListener('keydown',function(e){if(e.key==='Escape')parent.postMessage({type:'openakita-preview-close'},'*')},true)</script></head>${html}`;
}
