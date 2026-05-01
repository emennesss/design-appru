"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function ClientApprovalPage() {
  const params = useParams();
  const token = String(params.token || "");

  const [data, setData] = useState<any>(null);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [notes, setNotes] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [freezeNote, setFreezeNote] = useState("");
  const [clientMessage, setClientMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch(`/api/approval-links/get?token=${encodeURIComponent(token)}`).then(r => r.json());
    setData(res);
    setLoading(false);
  }

  useEffect(() => {
    if (token) load();
  }, [token]);

  async function sendClientMessage() {
    const designId = data?.approvalLink?.designId || data?.design?.id;

    if (!designId) {
      alert("Design ID missing.");
      return;
    }

    if (!clientMessage.trim()) {
      alert("Please type a message.");
      return;
    }

    if (!confirm("Send this message to designer?")) return;

    const res = await fetch("/api/design-thread/add-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        designId,
        note: clientMessage,
        actorEmail: data?.approvalLink?.recipientEmail || "client",
        actorSide: "client",
        actionType: "comment",
        versionNo: data?.approvalLink?.versionNo || data?.design?.currentVersion || 1,
        visibility: "both",
      }),
    }).then(r => r.json());

    if (res.error) {
      alert(res.error);
      return;
    }

    setClientMessage("");
    alert("Message sent.");
  }

  async function submitDecision() {

    if (!confirm(
      decision === "approved"
        ? "Approve this version?"
        : "Request revision for this version?"
    )) return;
    const res = await fetch("/api/approval-links/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        decision,
        notes,
        dimensions: {
          length,
          width,
          height,
        },
      }),
    }).then(r => r.json());

    if (res.error) {
      alert(res.error);
      return;
    }

    alert(decision === "approved" ? "Version approved." : "Revision requested.");
    await load();
  }

  async function finalFreeze() {
    const designId = data?.approvalLink?.designId || data?.design?.id;

    if (!designId) {
      alert("Design ID missing.");
      return;
    }

    if (!confirm("FINAL FREEZE: This will lock the design permanently for production. Cannot be undone. Continue?")) {
      return;
    }

    const res = await fetch("/api/design-thread/freeze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        designId,
        actorEmail: data?.approvalLink?.recipientEmail || "",
        freezeNote,
      }),
    }).then(r => r.json());

    if (res.error) {
      alert(res.error);
      return;
    }

    alert("Design finally approved and frozen.");
    await load();
  }

  if (loading) return <div style={{ padding: 24 }}>Loading approval...</div>;

  const design = data?.design || {};
  const approvalLink = data?.approvalLink || {};
  const isApproved = design.status === "approved";
  const isFrozen = design.status === "frozen";
  const linkVersion = Number(approvalLink.versionNo || 1);
  const currentVersion = Number(design.currentVersion || 1);
  const isOldLink = linkVersion !== currentVersion;

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Client Design Approval</h1>

      <div style={{ padding: 18, border: "1px solid #ddd", borderRadius: 12, marginBottom: 20 }}>
        <h2>{design.title || "Untitled Design"}</h2>
        <p><b>Status:</b> {design.status || approvalLink.status || "-"}</p>
        <p><b>Stage:</b> {design.approvalStage || "-"}</p>
        <p><b>Review Version:</b> V{approvalLink.versionNo || design.currentVersion || 1}</p>
        <p><b>Current Design Version:</b> V{design.currentVersion || 1}</p>

        {design.latestFileUrl && (
          <p>
            <a href={approvalLink.versionFileUrl || design.latestFileUrl} target="_blank" style={{ color: "#2563eb", fontWeight: 700 }}>
              Open Version File
            </a>
          </p>
        )}
      </div>

      {!isFrozen && (
        <div style={{ padding: 18, border: "1px solid #ddd", borderRadius: 12, marginBottom: 20 }}>
          <h2>Send Message to Designer</h2>
          <p>This is only a message. It will not approve, reject, or freeze the design.</p>

          <textarea
            placeholder="Type your message..."
            value={clientMessage}
            onChange={e => setClientMessage(e.target.value)}
            style={{ ...input, height: 90 }}
          />

          <button onClick={sendClientMessage} style={button}>
            Send Message Only
          </button>
        </div>
      )}

      {isOldLink && !isFrozen && (
        <div style={{ padding: 18, border: "2px solid #dc2626", borderRadius: 12, background: "#fef2f2", marginBottom: 20 }}>
          <h2>Old Approval Link</h2>
          <p>This link is for V{linkVersion}, but the latest design version is V{currentVersion}.</p>
          <p>Please ask the designer to send the latest approval link.</p>
        </div>
      )}

      {!isOldLink && !isFrozen && !isApproved && (
        <div style={{ padding: 18, border: "1px solid #ddd", borderRadius: 12, marginBottom: 20 }}>
          <h2>Review This Version</h2>

          <select value={decision} onChange={(e) => setDecision(e.target.value as any)} style={input}>
            <option value="approved">Approve Version</option>
            <option value="rejected">Request Revision</option>
          </select>

          {decision === "approved" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <input placeholder="Length" value={length} onChange={e => setLength(e.target.value)} style={input} />
              <input placeholder="Width" value={width} onChange={e => setWidth(e.target.value)} style={input} />
              <input placeholder="Height" value={height} onChange={e => setHeight(e.target.value)} style={input} />
            </div>
          )}

          <textarea
            placeholder="Client notes / revision comments"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ ...input, height: 100 }}
          />

          <button onClick={submitDecision} style={button}>
            Submit Review
          </button>
        </div>
      )}

      {!isOldLink && isApproved && !isFrozen && (
        <div style={{ padding: 18, border: "2px solid #16a34a", borderRadius: 12, marginBottom: 20 }}>
          <h2>Final Approval & Freeze</h2>
          <p>
            This design version is already approved. Click final freeze only when it is fully confirmed for production.
          </p>

          <textarea
            placeholder="Final freeze note, optional"
            value={freezeNote}
            onChange={e => setFreezeNote(e.target.value)}
            style={{ ...input, height: 90 }}
          />

          <button onClick={finalFreeze} style={{ ...button, background: "#16a34a" }}>
            FINAL APPROVE & FREEZE
          </button>
        </div>
      )}

      {isFrozen && (
        <div style={{ padding: 18, border: "2px solid #2563eb", borderRadius: 12, background: "#eff6ff" }}>
          <h2>Design Frozen</h2>
          <p>This design has been finally approved and locked by client.</p>
          <p><b>Frozen by:</b> {design.frozenByEmail || "-"}</p>
          <p><b>Frozen Version:</b> V{design.frozenVersion || design.currentVersion || 1}</p>
        </div>
      )}
    </main>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  border: "1px solid #bbb",
  borderRadius: 8,
  marginBottom: 12,
};

const button: React.CSSProperties = {
  width: "100%",
  padding: 12,
  border: 0,
  borderRadius: 8,
  background: "#111827",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};
