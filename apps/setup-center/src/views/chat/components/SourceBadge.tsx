import { useTranslation } from "react-i18next";
import type { Root, RootContent } from "mdast";
import i18n from "../../../i18n";

// P0-2 后续：把 LLM 输出里的 `[来源:工具]` / `[来源:历史]` / `[来源:常识]` /
// `[来源:不确定]` 反幻觉来源标签从"裸文本"渲染成可视化 badge。
//
// 这是 OpenAkita 防幻觉机制的一部分——后端 prompt 要求 LLM 在涉及外部事实的
// 句段后显式标注来源（详见 src/openakita/prompt/builder.py），过去前端原样
// 显示成 `[来源:工具]`，看起来像"模型 leak 出了系统提示词"，本组件统一渲染
// 为带 tooltip 的彩色徽章。
//
// 提供三种用法：
//   - <SourceBadge type="工具" />     单独渲染一个 badge（少见）
//   - <TextWithSourceBadges text=.. /> 用于纯文本上下文（thinking chain / thinking block）
//   - remarkSourceBadges            在共享 Markdown 管线中只转换普通文本节点；
//                                    不改写行内代码、代码块、链接目标或 HTML 属性。

export type SourceType = "工具" | "历史" | "常识" | "不确定";

export const SOURCE_TYPE_KIND: Record<SourceType, "tool" | "history" | "knowledge" | "uncertain"> = {
  "工具": "tool",
  "历史": "history",
  "常识": "knowledge",
  "不确定": "uncertain",
};

// Stateful regex must be re-created per scan (see splitTextWithSourceTags).
const SOURCE_TAG_PATTERN = "\\[来源[:：]\\s*(工具|历史|常识|不确定)\\s*\\]";

// Anchored variant for trailing-tag detection (used by extractTrailingSourceTag).
// Only matches when the tag is the LAST meaningful token (whitespace-only after).
const TRAILING_SOURCE_TAG_RE = /\[来源[:：]\s*(工具|历史|常识|不确定)\s*\]\s*$/;

/**
 * If the message ends with a `[来源:X]` tag, peel it off so the caller can
 * render it inline with the message footer (timestamp / tokens) instead of
 * letting it consume a full line at the bottom of the bubble.
 *
 * Conservative behavior:
 *   - Returns original text unchanged when no trailing tag is found.
 *   - Returns original text unchanged when the would-be-stripped tag sits
 *     inside an unclosed ``` code fence (tutorial / agent example must stay
 *     verbatim).
 */
export function extractTrailingSourceTag(text: string): {
  stripped: string;
  trailingType: SourceType | null;
} {
  if (!text) return { stripped: text, trailingType: null };
  const m = text.match(TRAILING_SOURCE_TAG_RE);
  if (!m || m.index === undefined) return { stripped: text, trailingType: null };
  const before = text.slice(0, m.index);
  const fenceCount = (before.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) return { stripped: text, trailingType: null };
  return {
    stripped: before.replace(/\s+$/, ""),
    trailingType: m[1] as SourceType,
  };
}

export function SourceBadge({ type }: { type: SourceType }) {
  const { t } = useTranslation();
  const kind = SOURCE_TYPE_KIND[type];
  const label = t(`chat.sourceTag.${kind}`, type);
  const tip = t(`chat.sourceTagTip.${kind}`, "");
  return (
    <span className={`srcBadge srcBadge-${kind}`} title={tip || undefined}>
      {label}
    </span>
  );
}

export type TextSegment =
  | { kind: "text"; value: string }
  | { kind: "badge"; type: SourceType };

export function splitTextWithSourceTags(text: string): TextSegment[] {
  if (!text) return [];
  const segs: TextSegment[] = [];
  const re = new RegExp(SOURCE_TAG_PATTERN, "g");
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      segs.push({ kind: "text", value: text.slice(lastIdx, m.index) });
    }
    segs.push({ kind: "badge", type: m[1] as SourceType });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx === 0) return [{ kind: "text", value: text }];
  if (lastIdx < text.length) {
    segs.push({ kind: "text", value: text.slice(lastIdx) });
  }
  return segs;
}

/**
 * Render plain text with inline source badges. Suitable for non-markdown contexts
 * (ThinkingChain entries, ThinkingBlock content). Preserves the original surface
 * whitespace by emitting each text segment as-is into a single span.
 */
export function TextWithSourceBadges({ text }: { text: string }) {
  const segs = splitTextWithSourceTags(text);
  if (segs.length === 0) return null;
  return (
    <>
      {segs.map((s, i) =>
        s.kind === "text" ? (
          <span key={i}>{s.value}</span>
        ) : (
          <SourceBadge key={i} type={s.type} />
        ),
      )}
    </>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Run after Markdown parsing so code examples remain literal, including while streaming. */
export function remarkSourceBadges() {
  return (tree: Root) => {
    function transform(parent: { children: RootContent[] }) {
      parent.children = parent.children.flatMap((node): RootContent[] => {
        if (node.type === "text") {
          return splitTextWithSourceTags(node.value).map((segment) => {
            if (segment.kind === "text") return { type: "text", value: segment.value };
            const kind = SOURCE_TYPE_KIND[segment.type];
            const label = escapeHtml(i18n.t(`chat.sourceTag.${kind}`, segment.type));
            const tip = escapeHtml(i18n.t(`chat.sourceTagTip.${kind}`, ""));
            // Controlled HTML still goes through the shared rehype sanitizer.
            return { type: "html", value: `<span class="srcBadge srcBadge-${kind}" title="${tip}">${label}</span>` };
          });
        }
        if ("children" in node) transform(node as { children: RootContent[] });
        return [node];
      });
    }
    transform(tree);
  };
}
