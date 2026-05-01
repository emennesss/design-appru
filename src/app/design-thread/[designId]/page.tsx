"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebaseClient";
import TopBar from "@/components/TopBar";
import PreviewModal from "@/components/PreviewModal";

export default function DesignThreadPage() {
  const { designId } = useParams();

  const [design, setDesign] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [approvalUrl, setApprovalUrl] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [versionNote, setVersionNote] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  async function loadData() {
    const d = await fetch(`/api/designs/get?designId=${designId}`).then(r => r.json());
    const n = await fetch(`/api/designs/notes?designId=${designId}`).then(r => r.json());
    const v = await fetch(`/api/designs/versions?designId=${designId}`).then(r => r.json());

    setDesign(d.design);
    setNotes(n.notes || []);
    setVersions(v.versions || []);
    setClientEmail(d.design?.latestApprovalRecipientEmail || "");
    setLoading(false);
  }

  useEffect(() => {
    if (!designId) return;

    loadData();

    const interval = setInterval(() => {
      loadData();
    }, 5000); // every 5 sec

    return () => clearInterval(interval);
  }, [designId]);

  
  const groupedTimeline = useMemo(() => {
    const map: Record<number, any[]> = {};

    // group versions first
    for (const v of versions || []) {
      const vNo = v.versionNo || 1;
      if (!map[vNo]) map[vNo] = [];

      map[vNo].push({
        type: "version_uploaded",
        actorSide: "designer",
        title: `Designer uploaded V${vNo}`,
        text: v.note || "",
        fileUrl: v.fileUrl,
        dimensions: v.dimensions,
        createdAt: v.createdAt,
      });
    }

    // add notes into same version
    for (const n of notes || []) {
      const vNo = n.versionNo || 1;
      if (!map[vNo]) map[vNo] = [];

      map[vNo].push({
        type: n.actionType || "note",
        actorSide: n.actorSide || "designer",
        title:
          n.actionType === "approved"
            ? "Client approved"
            : n.actionType === "revision_requested"
            ? "Client requested revision"
            : n.actorSide === "client"
            ? "Client comment"
            : "Designer note",
        text: n.note || "",
        createdAt: n.createdAt,
      });
    }

    // sort inside each version
    const sorted = Object.entries(map).map(([vNo, items]: any) => {
      items.sort((a: any, b: any) => {
        const av = a.createdAt?.seconds || 0;
        const bv = b.createdAt?.seconds || 0;
        return av - bv;
      });

      return {
        version: Number(vNo),
        items,
      };
    });

    // sort versions
    sorted.sort((a, b) => a.version - b.version);

    return sorted;
  }, [notes, versions]);


  async function uploadNewVersion() {

    if (!confirm("Upload new version? This will replace current version.")) return;
    if (!design) return;
    if (design.status === "frozen") return alert("Frozen design cannot be changed.");
    if (!newFile) return alert("Choose a file first.");

    setUploading(true);

    try {
      const nextVersion = Number(design.currentVersion || 1) + 1;
      const designerOrgId = design.designerOrgId || design.tenantId || "default";
      const safeName = `${Date.now()}-v${nextVersion}-${newFile.name}`;
      const path = `designs/${designerOrgId}/${designId}/versions/${safeName}`;

      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, newFile);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, "designVersions"), {
        designId,
        tenantId: design.tenantId || designerOrgId,
        designerOrgId,
        clientOrgId: design.clientOrgId || null,
        organizationLinkId: design.organizationLinkId || null,
        versionNo: nextVersion,
        fileUrl: url,
        fileName: newFile.name,
        uploadedByEmail: auth.currentUser?.email || "",
        note: versionNote || "",
        dimensions: { length, width, height },
        status: "uploaded",
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "designs", String(designId)), {
        currentVersion: nextVersion,
        latestFileUrl: url,
        latestFileName: newFile.name,
        status: "uploaded",
        approvalStage: `designer_uploaded_v${nextVersion}`,
        clientDecision: null,
        approvedVersion: null,
        updatedAt: serverTimestamp(),
      });

      await fetch("/api/design-thread/add-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId,
          note: `Uploaded V${nextVersion}${versionNote ? ": " + versionNote : ""}`,
          actorEmail: auth.currentUser?.email || "",
          actorSide: "designer",
          actionType: "version_uploaded",
          versionNo: nextVersion,
          visibility: "both",
        }),
      });

      setNewFile(null);
      setVersionNote("");
      setLength("");
      setWidth("");
      setHeight("");
      await loadData();
      alert(`Version V${nextVersion} uploaded.`);
    } catch (err) {
      console.error(err);
      alert("Version upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function addNote() {
    if (!noteInput.trim()) return;

    await fetch("/api/design-thread/add-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        designId,
        note: noteInput,
        actorEmail: auth.currentUser?.email || "",
        actorSide: "designer",
        actionType: "comment",
        visibility: "both",
      }),
    });

    setNoteInput("");
    loadData();
  }

  async function sendApproval() {

    if (!confirm("Send this version to client for approval?")) return;
    if (design?.status === "frozen") return alert("Frozen design cannot be resent.");
    if (!clientEmail.trim()) return alert("Client email required.");

    const res = await fetch("/api/approval-links/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designId, recipientEmail: clientEmail }),
    }).then(r => r.json());

    if (res.error) return alert(res.error);

    setApprovalUrl(res.approvalUrl);
    alert("Approval link created.");
    loadData();
  }

  if (loading) {
    return (
      <div>
        <TopBar />
        <div style={{ padding: 24 }}>Loading design thread...</div>
      </div>
    );
  }

  return (
    <div>
      <TopBar />

      {previewUrl && <PreviewModal url={previewUrl} onClose={() => setPreviewUrl("")} />}

      <main style={{ padding: 24, maxWidth: 1150, margin: "0 auto" }}>
        <a href="/dashboard">← Back to Designer Dashboard</a>

        <h1>{design?.title || "Untitled Design"}</h1>

        <div style={summaryCard}>
          <div>
            <b>Status</b>
            <div>{design?.status || "-"}</div>
          </div>
          <div>
            <b>Stage</b>
            <div>{design?.approvalStage || "-"}</div>
          </div>
          <div>
            <b>Customer</b>
            <div>{design?.customerName || "-"}</div>
          </div>
          <div>
            <b>Current Version</b>
            <div>V{design?.currentVersion || 1}</div>
          </div>
          <div>
            <b>Approver</b>
            <div>{design?.latestApprovalRecipientEmail || "-"}</div>
          </div>
        </div>

        {design?.latestFileUrl && (
          <div style={card}>
            <h2>Current File</h2>
            <button type="button" onClick={() => setPreviewUrl(design.latestFileUrl)} style={smallButton}>
              Preview Current File
            </button>
            <a href={design.latestFileUrl} target="_blank" style={link}>Open current file</a>
          </div>
        )}

        <div style={card}>
          <h2>Upload New Version</h2>
          {design?.status === "frozen" ? (
            <p>This design is frozen. No further version uploads allowed.</p>
          ) : (
            <>
              <input type="file" onChange={e => setNewFile(e.target.files?.[0] || null)} style={input} />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <input placeholder="Length" value={length} onChange={e => setLength(e.target.value)} style={input} />
                <input placeholder="Width" value={width} onChange={e => setWidth(e.target.value)} style={input} />
                <input placeholder="Height" value={height} onChange={e => setHeight(e.target.value)} style={input} />
              </div>

              <textarea
                value={versionNote}
                onChange={e => setVersionNote(e.target.value)}
                placeholder="Version note, e.g. handle changed, logo resized..."
                style={{ ...input, height: 80 }}
              />

              <button onClick={uploadNewVersion} disabled={uploading} style={button}>
                {uploading ? "Uploading..." : `Upload V${Number(design?.currentVersion || 1) + 1}`}
              </button>
            </>
          )}
        </div>

        <div style={card}>
          <h2>Send / Re-send Approval</h2>
          <input
            placeholder="Client approver email"
            value={clientEmail}
            onChange={e => setClientEmail(e.target.value)}
            style={input}
          />
          <button onClick={sendApproval} style={button}>Create Approval Link for Current Version</button>

          {approvalUrl && (
            <div style={{ marginTop: 12, padding: 12, background: "#f3f4f6", borderRadius: 8 }}>
              <b>Approval URL:</b><br />
              <a href={approvalUrl} target="_blank">{approvalUrl}</a>
            </div>
          )}
        </div>

        <div style={card}>
          <h2>Design Timeline</h2>

          {groupedTimeline.length === 0 ? (
            <p>No timeline yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {groupedTimeline.map((group) => (
                <div key={group.version} style={{ marginBottom: 24 }}>
                  <h3 style={{ marginBottom: 10 }}>Version V{group.version}</h3>

                  {group.items.map((event: any, idx: number) => (
                    <TimelineBubble
                      key={idx}
                      event={event}
                      onPreview={(url: string) => setPreviewUrl(url)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <h2>Add Designer Note</h2>
          <textarea
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            placeholder="Add designer note..."
            style={{ ...input, height: 100 }}
          />
          <button onClick={addNote} style={button}>Add Note</button>
        </div>

        {design?.status === "frozen" && (
          <div style={{ ...card, border: "2px solid #2563eb", background: "#eff6ff" }}>
            <h2>Final Frozen Design</h2>
            <p><b>Frozen by:</b> {design.frozenByEmail || "-"}</p>
            <p><b>Frozen Version:</b> V{design.frozenVersion || design.currentVersion || 1}</p>
          </div>
        )}
      </main>
    </div>
  );
}

function TimelineBubble({ event, onPreview }: any) {
  const isClient = event.actorSide === "client";

  return (
    <div style={{
      display: "flex",
      justifyContent: isClient ? "flex-start" : "flex-end",
    }}>
      <div style={{
        maxWidth: "72%",
        padding: 14,
        borderRadius: 16,
        background: isClient ? "#fff7ed" : "#eff6ff",
        border: isClient ? "1px solid #fed7aa" : "1px solid #bfdbfe",
        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
      }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>
          {eventIcon(event.type)} {event.title}
        </div>

        {event.versionNo && (
          <div style={miniTag}>V{event.versionNo}</div>
        )}

        {event.text && <p style={{ margin: "8px 0" }}>{event.text}</p>}

        {event.dimensions && (
          <p style={{ margin: "8px 0", color: "#555" }}>
            Dimensions: L {event.dimensions.length || "-"} × W {event.dimensions.width || "-"} × H {event.dimensions.height || "-"}
          </p>
        )}

        {event.fileUrl && (
          <div style={{ marginTop: 10 }}>
            <button type="button" onClick={() => onPreview(event.fileUrl)} style={smallButton}>
              Preview
            </button>
            <a href={event.fileUrl} target="_blank" style={link}>
              Open file
            </a>
          </div>
        )}

        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          {formatDate(event.createdAt)}
        </div>
      </div>
    </div>
  );
}

function titleForNote(n: any) {
  if (n.actionType === "approved") return "Client approved";
  if (n.actionType === "revision_requested") return "Client requested revision";
  if (n.actionType === "version_uploaded") return "Designer uploaded version";
  if (n.actorSide === "client") return "Client comment";
  return "Designer comment";
}

function eventIcon(type: string) {
  if (type === "approved") return "✅";
  if (type === "revision_requested") return "🔁";
  if (type === "version_uploaded") return "📎";
  if (type === "final_freeze") return "🔒";
  return "💬";
}

function formatDate(v: any) {
  if (!v?.seconds) return "";
  return new Date(v.seconds * 1000).toLocaleString();
}

const summaryCard: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 12,
  padding: 18,
  border: "1px solid #ddd",
  borderRadius: 12,
  background: "white",
  marginTop: 18,
};

const card: React.CSSProperties = {
  padding: 18,
  border: "1px solid #ddd",
  borderRadius: 12,
  background: "white",
  marginTop: 18,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  marginBottom: 12,
  border: "1px solid #bbb",
  borderRadius: 8,
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

const smallButton: React.CSSProperties = {
  display: "inline-block",
  padding: "7px 10px",
  border: 0,
  borderRadius: 6,
  background: "#111827",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
  marginRight: 10,
};

const link: React.CSSProperties = {
  color: "#2563eb",
  fontWeight: 700,
};

const miniTag: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 8px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.08)",
  fontSize: 12,
  fontWeight: 800,
};
