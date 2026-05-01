"use client";

export default function PreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  if (!url) return null;

  const isPdf = url.toLowerCase().includes(".pdf");
  const isImage = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 12,
          padding: 12,
          width: "95vw",
          height: "90vh",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            right: 14,
            top: 14,
            zIndex: 2,
            background: "#dc2626",
            color: "white",
            border: 0,
            borderRadius: 6,
            padding: "8px 12px",
            cursor: "pointer",
          }}
        >
          Close
        </button>

        {isImage && (
          <img
            src={url}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
        )}

        {isPdf && (
          <iframe
            src={url}
            style={{
              width: "100%",
              height: "100%",
              border: 0,
            }}
          />
        )}

        {!isImage && !isPdf && (
          <div style={{ padding: 40 }}>
            <h2>Preview not available for this file type.</h2>
            <a href={url} target="_blank">Download / Open file</a>
          </div>
        )}
      </div>
    </div>
  );
}
