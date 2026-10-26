import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceFile } from "../views/chat/hooks/useWorkspaceFile";
import { isolatedHtmlDocument, type WorkspaceFile } from "../views/chat/utils/workspaceFiles";

export function WorkspaceFileImage({ file, alt, onPreview, ...props }: {
  file: WorkspaceFile;
  alt: string;
  onPreview: (objectUrl: string) => void;
} & Omit<ComponentPropsWithoutRef<"img">, "src" | "onClick" | "onKeyDown">) {
  const resource = useWorkspaceFile(file);
  const { t } = useTranslation();
  if (resource.error) return <span role="alert">{t(`chat.filePreview.${resource.error}`)}</span>;
  if (!resource.objectUrl) return <span role="status">{t("chat.filePreview.loading")}</span>;
  return <img {...props} src={resource.objectUrl} alt={alt} role="button" tabIndex={0}
    onMouseDown={(e) => e.stopPropagation()}
    style={{ ...props.style, cursor: "pointer" }} onClick={() => onPreview(resource.objectUrl!)}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPreview(resource.objectUrl!); } }} />;
}

/** Shared by Markdown file links and HTML attachment cards. */
export function WorkspaceFilePreview({ file, onClose }: { file: WorkspaceFile; onClose: () => void }) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const resource = useWorkspaceFile(file);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // The opaque frame may only request closing its own preview.
      if (frameRef.current && event.source === frameRef.current.contentWindow
        && event.data?.type === "openakita-preview-close") onClose();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onClose]);
  return (
    <dialog ref={dialogRef} className="workspaceFilePreview" aria-label={file.name}
      onMouseDown={(e) => e.stopPropagation()}
      onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <header className="workspaceFilePreviewHeader">
        <strong title={file.name}>{file.name}</strong>
        <button type="button" className="btn" onClick={onClose} aria-label={t("common.close")}>×</button>
      </header>
      <div className="workspaceFilePreviewBody">
        {resource.error ? <div className="workspaceFilePreviewStatus" role="alert">
          <p>{t(`chat.filePreview.${resource.error}`)}</p>
          <button type="button" className="btn" onClick={resource.retry}>{t("common.retry")}</button>
        </div> : !resource.objectUrl ? <div className="workspaceFilePreviewStatus" role="status">
          {t("chat.filePreview.loading")}
        </div> : file.kind === "html" ? <iframe ref={frameRef} title={file.name} sandbox="allow-scripts"
          referrerPolicy="no-referrer" srcDoc={isolatedHtmlDocument(resource.html || "")} />
          : file.kind === "image" ? <img src={resource.objectUrl} alt={file.name} />
          : <div className="workspaceFilePreviewStatus">{t("chat.filePreview.downloadOnly")}</div>}
      </div>
      <footer className="workspaceFilePreviewFooter">
        <span>{file.kind === "html" ? t("chat.filePreview.isolated") : ""}</span>
        {resource.objectUrl && <a className="btn" href={resource.objectUrl} download={file.name}>
          {t("chat.filePreview.download")}
        </a>}
      </footer>
    </dialog>
  );
}
