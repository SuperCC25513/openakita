import { useEffect, useState } from "react";
import { safeFetchResponse } from "../../../providers";
import type { WorkspaceFile } from "../utils/workspaceFiles";

type FileResource = {
  url: string;
  objectUrl?: string;
  html?: string;
  error?: "unauthorized" | "notFound" | "failed";
};

/** Auth stays in the request header; previews and downloads only receive a Blob URL. */
export function useWorkspaceFile(file: WorkspaceFile) {
  const [attempt, setAttempt] = useState(0);
  const [resource, setResource] = useState<FileResource>({ url: file.url });
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setResource({ url: file.url });
    void (async () => {
      try {
        const response = await safeFetchResponse(file.url, { signal: controller.signal });
        if (!response.ok) {
          if (!controller.signal.aborted) setResource({
            url: file.url,
            error: response.status === 401 ? "unauthorized" : response.status === 404 ? "notFound" : "failed",
          });
          return;
        }
        const html = file.kind === "html" ? await response.text() : undefined;
        const blob = html === undefined ? await response.blob() : new Blob([html], { type: "text/html;charset=utf-8" });
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResource({ url: file.url, objectUrl, html });
      } catch {
        if (!controller.signal.aborted) setResource({ url: file.url, error: "failed" });
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.url, file.kind, attempt]);
  return {
    ...(resource.url === file.url ? resource : { url: file.url }),
    retry: () => setAttempt((n) => n + 1),
  };
}
