import { useEffect, createElement } from "react";
import { ArrowLeft, ExternalLink, X } from "lucide-react";

// In-app browser overlay. Renders the target page in an Electron <webview> —
// its own webContents, so real sites load (unlike an iframe, which most sites
// block via X-Frame-Options). The chat stays mounted underneath; Back / Esc /
// close return to it, and "Open in browser" hands the URL to the system browser.
export default function LinkView({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  let host = url;
  try {
    host = new URL(url).host || url;
  } catch {
    /* keep the raw url */
  }

  return (
    <div className="link-view">
      <div className="link-view-bar">
        <button className="lv-btn" onClick={onClose} title="Back to your chat">
          <ArrowLeft size={16} /> Back
        </button>
        <span className="lv-url" title={url}>{host}</span>
        <button
          className="lv-btn"
          onClick={() => window.accela.openExternal(url)}
          title="Open in your default browser"
        >
          <ExternalLink size={15} /> Open in browser
        </button>
        <button className="lv-close" onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>
      {createElement("webview" as any, { src: url, className: "link-webview" })}
    </div>
  );
}
