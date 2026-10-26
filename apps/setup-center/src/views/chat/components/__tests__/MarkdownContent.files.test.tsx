import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReactMarkdown from "react-markdown";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../../i18n";
import { MarkdownContent } from "../MarkdownContent";
import type { MdModules } from "../../utils/chatTypes";

const request = vi.hoisted(() => vi.fn());
vi.mock("../../../../providers", () => ({ safeFetchResponse: request }));

const mdModules: MdModules = { ReactMarkdown, remarkPlugins: [], rehypePlugins: [] };
const html = '<!doctype html><html><body><button onclick="this.textContent=\'运行中\'">开始</button></body></html>';
const createObjectURL = vi.fn(() => "blob:preview-test");
const revokeObjectURL = vi.fn();

beforeEach(async () => {
  await i18n.changeLanguage("zh");
  request.mockReset().mockResolvedValue({ ok: true, status: 200, text: async () => html,
    blob: async () => new Blob(["image-bytes"], { type: "image/png" }) });
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperties(URL, { createObjectURL: { configurable: true, value: createObjectURL },
    revokeObjectURL: { configurable: true, value: revokeObjectURL } });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

function renderMessage(content: string) {
  return render(<MarkdownContent content={content} mdModules={mdModules}
    apiBaseUrl="https://ops.example.com" conversationId="chat-1" />);
}

describe("Markdown workspace files", () => {
  it("opens the reported screenshot link through auth-aware fetch, not a bare navigation", async () => {
    renderMessage("[浅色截图](/workspace/anatomy-demo/source/shots/lines-light.png)");
    const link = screen.getByRole("link", { name: "浅色截图" });
    expect(link.getAttribute("href")).toContain("/api/files?");
    fireEvent.click(link);
    const image = await screen.findByRole("img", { name: "lines-light.png" });
    expect(image).toHaveAttribute("src", "blob:preview-test");
    expect(request).toHaveBeenCalledTimes(1);
    const [url] = request.mock.calls[0];
    expect(new URL(url).searchParams.get("path")).toBe("/workspace/anatomy-demo/source/shots/lines-light.png");
    expect(new URL(url).searchParams.get("conversation_id")).toBe("chat-1");
    expect(url).not.toContain("token");
    expect(screen.getByRole("link", { name: "下载" })).toHaveAttribute("download", "lines-light.png");
  });

  it("previews HTML with scripts but no same-origin, popup, form or host-navigation privileges", async () => {
    renderMessage("[交互页面](/workspace/anatomy-demo/coffee-machine.html)");
    fireEvent.click(screen.getByRole("link", { name: "交互页面" }));
    await waitFor(() => expect(document.querySelector("iframe")).not.toBeNull());
    const frame = document.querySelector("iframe")!;
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(frame.getAttribute("srcdoc")).toContain(html);
    expect(frame.getAttribute("srcdoc")).toContain("connect-src 'none'");
    expect(frame.getAttribute("srcdoc")).not.toContain("token=");
    expect(frame).not.toHaveAttribute("src");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-test");
  });

  it("also loads embedded workspace images using Blob URLs", async () => {
    renderMessage("![截图](/workspace/demo.png)");
    const image = await screen.findByRole("button", { name: "截图" });
    expect(image).toHaveAttribute("src", "blob:preview-test");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("only accepts close requests from the currently previewed iframe", async () => {
    renderMessage("[HTML](/workspace/demo.html)");
    fireEvent.click(screen.getByRole("link", { name: "HTML" }));
    await waitFor(() => expect(document.querySelector("iframe")).not.toBeNull());
    fireEvent(window, new MessageEvent("message", { source: window, data: { type: "openakita-preview-close" } }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const source = document.querySelector("iframe")!.contentWindow;
    fireEvent(window, new MessageEvent("message", { source, data: { type: "openakita-preview-close" } }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not authenticate or rewrite external links and images", () => {
    renderMessage("[文档](https://example.com/workspace/docs.html) ![外部图片](https://example.com/a.png)");
    expect(screen.getByRole("link", { name: "文档" })).toHaveAttribute("href", "https://example.com/workspace/docs.html");
    expect(screen.getByRole("img", { name: "外部图片" })).toHaveAttribute("src", "https://example.com/a.png");
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves the existing image-preview callback and gives web downloads a Blob", async () => {
    const onImagePreview = vi.fn();
    render(<MarkdownContent content="![截图](/api/files?path=demo.png)" mdModules={mdModules}
      apiBaseUrl="https://ops.example.com" onImagePreview={onImagePreview} />);
    fireEvent.click(await screen.findByRole("button", { name: "截图" }));
    expect(onImagePreview).toHaveBeenCalledWith("blob:preview-test", "blob:preview-test", "截图");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([[401, "登录已失效"], [404, "文件不存在"], [500, "文件加载失败"]])(
    "shows an actionable error for HTTP %s and supports retry", async (status, message) => {
      request.mockResolvedValueOnce({ ok: false, status });
      renderMessage("[HTML](/workspace/demo.html)");
      fireEvent.click(screen.getByRole("link", { name: "HTML" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(document.querySelector("iframe")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "重试" }));
      await waitFor(() => expect(document.querySelector("iframe")).not.toBeNull());
      expect(request).toHaveBeenCalledTimes(2);
    },
  );

  it("cancels closed previews and discards late responses", async () => {
    let finish!: (response: unknown) => void;
    request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { unmount } = renderMessage("[HTML](/workspace/demo.html)");
    fireEvent.click(screen.getByRole("link", { name: "HTML" }));
    await waitFor(() => expect(request).toHaveBeenCalled());
    const signal = request.mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
    finish({ ok: true, text: async () => html });
    await waitFor(() => expect(createObjectURL).not.toHaveBeenCalled());
  });
});
