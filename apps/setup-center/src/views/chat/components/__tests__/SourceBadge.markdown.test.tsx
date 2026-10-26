import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import i18n from "../../../../i18n";
import { useMdModules } from "../../hooks/useMdModules";

function Markdown({ text }: { text: string }) {
  const md = useMdModules();
  return md ? <md.ReactMarkdown remarkPlugins={md.remarkPlugins} rehypePlugins={md.rehypePlugins}>
    {text}
  </md.ReactMarkdown> : null;
}

beforeEach(async () => { await i18n.changeLanguage("zh"); });
afterEach(cleanup);

describe("source badges in the shared Markdown pipeline", () => {
  it("renders normal tags as localized badges with tooltips", async () => {
    const { container } = render(<Markdown text="已验证 [来源:工具]；推断 [来源：不确定]" />);
    await waitFor(() => expect(container.querySelectorAll(".srcBadge")).toHaveLength(2));
    expect(container.querySelector(".srcBadge-tool")).toHaveTextContent("工具");
    expect(container.querySelector(".srcBadge-tool")).toHaveAttribute("title", "基于工具调用获取信息");
    expect(container.textContent).not.toContain("<span");
  });

  it("preserves the reported inline-code case instead of exposing span markup", async () => {
    const { container } = render(<Markdown text={'- `[来源:工具]` 深色和浅色页面均成功构建。'} />);
    await screen.findByText("[来源:工具]");
    expect(container.querySelector("code")?.textContent).toBe("[来源:工具]");
    expect(container.querySelector(".srcBadge")).toBeNull();
    expect(container.textContent).not.toContain("srcBadge");
  });

  it.each(["```text\n[来源:工具]\n```", "~~~text\n[来源:工具]\n~~~", "```\n[来源:工具]"])(
    "preserves fenced code, including unfinished streamed fences: %s", async (text) => {
      const { container } = render(<Markdown text={text} />);
      await screen.findByText("[来源:工具]");
      expect(container.querySelector("pre code")?.textContent).toContain("[来源:工具]");
      expect(container.querySelector(".srcBadge")).toBeNull();
    },
  );

  it("does not rewrite link destinations or HTML attributes", async () => {
    const { container } = render(<Markdown text={'[链接](https://example.com/[来源:工具]) <span title="[来源:历史]">说明</span>'} />);
    const link = await screen.findByRole("link", { name: "链接" });
    expect(decodeURI(link.getAttribute("href")!)).toBe("https://example.com/[来源:工具]");
    expect(container.querySelector("span")?.title).toBe("[来源:历史]");
    expect(container.querySelector(".srcBadge")).toBeNull();
  });

  it("handles partial tokens and keeps raw HTML sanitized", async () => {
    const { container, rerender } = render(<Markdown text="进度 [来源:工" />);
    await screen.findByText("进度 [来源:工");
    rerender(<Markdown text={'进度 [来源:工具] <script>alert(1)</script><img src="x" onerror="alert(1)">'} />);
    await waitFor(() => expect(container.querySelector(".srcBadge-tool")).not.toBeNull());
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });
});
