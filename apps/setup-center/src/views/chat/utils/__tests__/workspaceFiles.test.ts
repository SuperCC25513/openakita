import { describe, expect, it } from "vitest";
import { isolatedHtmlDocument, resolveWorkspaceFile } from "../workspaceFiles";

const base = "https://ops.example.com";

describe("workspace file links", () => {
  it("maps container paths to the authenticated API with the current conversation scope", () => {
    const file = resolveWorkspaceFile("/workspace/演示/浅色 图.png", base, "chat-1")!;
    expect(file.kind).toBe("image");
    expect(file.name).toBe("浅色 图.png");
    const url = new URL(file.url);
    expect(url.pathname).toBe("/api/files");
    expect(url.searchParams.get("path")).toBe("/workspace/演示/浅色 图.png");
    expect(url.searchParams.get("conversation_id")).toBe("chat-1");
  });

  it("accepts same-backend absolute links but never carries tokens into result URLs", () => {
    const file = resolveWorkspaceFile(`${base}/workspace/demo/page.HTML?token=secret`, base)!;
    expect(file.kind).toBe("html");
    expect(file.url).not.toContain("secret");
    expect(file.url).not.toContain("token=");
  });

  it("keeps existing unscoped and explicitly scoped API links usable", () => {
    const file = resolveWorkspaceFile("/api/files?path=D%3A%2Fnotes%2Freport.htm&conversation_id=old&token=secret", base)!;
    expect(file.path).toBe("D:/notes/report.htm");
    expect(file.kind).toBe("html");
    expect(new URL(file.url).searchParams.get("conversation_id")).toBe("old");
    expect(resolveWorkspaceFile("/api/files?path=report.zip", base)?.url).not.toContain("conversation_id");
  });

  it.each([
    "https://external.example.com/workspace/a.png", "//external.example.com/api/files?path=a.png",
    "https://ops.example.com.evil.test/workspace/a.png", "/docs/page.html", "data:image/png;base64,x",
    "blob:https://ops.example.com/1", "javascript:alert(1)", "/workspace/%zz.png", "/workspace/",
  ])("leaves ordinary, external or invalid URLs alone: %s", (href) => {
    expect(resolveWorkspaceFile(href, base)).toBeNull();
  });

  it("prepends the preview policy before untrusted markup", () => {
    const html = '<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"></head><body><button>Play</button></body></html>';
    const document = isolatedHtmlDocument(html);
    expect(document.indexOf("default-src 'none'")).toBeLessThan(document.indexOf("default-src *"));
    expect(document).toContain("connect-src 'none'");
    expect(document).toContain("base-uri 'none'");
    expect(document).toContain(html);
  });
});
