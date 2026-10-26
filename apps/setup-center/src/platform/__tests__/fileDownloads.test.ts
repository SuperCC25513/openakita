import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authFetch = vi.hoisted(() => vi.fn());
vi.mock("../auth", () => ({ authFetch, getAccessToken: () => "qa-token" }));
vi.mock("../detect", () => ({ IS_TAURI: false, IS_WEB: true, IS_CAPACITOR: false,
  IS_LOCAL_WEB: false, IS_MOBILE_BROWSER: false }));
import { downloadFile, saveAttachment } from "../index";

beforeEach(() => {
  vi.useFakeTimers();
  authFetch.mockReset().mockResolvedValue({ ok: true, blob: async () => new Blob(["file contents"]) });
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: vi.fn(() => "blob:download") },
    revokeObjectURL: { configurable: true, value: vi.fn() },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("browser file downloads", () => {
  it("uses auth-aware fetch and a Blob for file API downloads", async () => {
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.href); });
    await saveAttachment({ apiUrl: "/api/files?path=coffee-machine.html", filename: "coffee-machine.html" });
    expect(authFetch).toHaveBeenCalledWith("/api/files?path=coffee-machine.html");
    expect(clicks).toEqual(["blob:download"]);
    await vi.runAllTimersAsync();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:download");
  });

  it("keeps downloadFile's return value and filename contract", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    expect(await downloadFile("/api/files?path=image.png", "image.png")).toBe("image.png");
    expect(authFetch).toHaveBeenCalledOnce();
    expect(click.mock.instances[0]).toHaveAttribute("download", "image.png");
  });

  it("does not navigate or create a download after an auth failure", async () => {
    authFetch.mockResolvedValue({ ok: false, status: 401 });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await expect(saveAttachment({ apiUrl: "/api/files?path=image.png", filename: "image.png" })).rejects.toThrow("HTTP 401");
    expect(click).not.toHaveBeenCalled();
  });

  it.each(["https://example.com/file.png", "https://example.com/api/files?path=external.png", "blob:already-fetched"])(
    "preserves non-backend URLs without sending authentication: %s", async (apiUrl) => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      await saveAttachment({ apiUrl, filename: "file.png" });
      expect(authFetch).not.toHaveBeenCalled();
      expect(click.mock.instances[0]).toHaveAttribute("href", apiUrl);
    },
  );
});
