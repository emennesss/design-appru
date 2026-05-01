"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";
import TopBar from "@/components/TopBar";
import { getUserSide } from "@/lib/userRoles";

export default function DesignerDashboard() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [designs, setDesigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser?.email) {
        router.push("/login");
        return;
      }

      const email = firebaseUser.email.toLowerCase();
      const res = await fetch(`/api/users/get?email=${encodeURIComponent(email)}`).then((r) => r.json());

      if (!res.user) {
        alert("User profile not found.");
        router.push("/login");
        return;
      }

      if (res.user.role === "superadmin") {
        router.push("/superadmin");
        return;
      }

      if (getUserSide(res.user) === "client") {
        router.push("/client/dashboard");
        return;
      }

      setUser(res.user);
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user?.designerOrgId && !user?.tenantId) return;

    const designerOrgId = user.designerOrgId || user.tenantId || "default";

    const q = query(
      collection(db, "designs"),
      where("designerOrgId", "==", designerOrgId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const av = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
          const bv = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
          return bv - av;
        });

      setDesigns(rows);
    });

    return () => unsub();
  }, [user]);

  const grouped = useMemo(() => groupByClientAndApprover(designs), [designs]);

  const pending = designs.filter((d) => ["sent", "uploaded"].includes(d.status));
  const revision = designs.filter((d) => d.status === "revision_requested");
  const approved = designs.filter((d) => d.status === "approved");
  const frozen = designs.filter((d) => d.status === "frozen");

  if (loading) {
    return (
      <div>
        <TopBar />
        <div style={{ padding: 24 }}>Loading designer dashboard...</div>
      </div>
    );
  }

  return (
    <div>
      <TopBar />

      <main style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
        <h1>Designer Dashboard</h1>

        <p style={{ color: "#666" }}>
          Role: <b>{user?.role}</b> | Designer Org: <b>{user?.designerOrgId || user?.tenantId}</b>
        </p>

        <div style={statGrid}>
          <Stat title="Pending Approval" value={pending.length} />
          <Stat title="Revision Requested" value={revision.length} />
          <Stat title="Approved / Waiting Freeze" value={approved.length} />
          <Stat title="Frozen Final" value={frozen.length} />
        </div>

        <div style={{ marginTop: 24 }}>
          <a href="/designs/new" style={primaryButton}>
            + Create New Design
          </a>
        </div>

        <h2 style={{ marginTop: 34 }}>Client / Approver Wise Design Threads</h2>

        {grouped.length === 0 ? (
          <Empty text="No designs found yet." />
        ) : (
          <div style={{ display: "grid", gap: 22 }}>
            {grouped.map((client: any) => (
              <div key={client.clientKey} style={clientCard}>
                <h2 style={{ margin: 0 }}>{client.clientName}</h2>
                <p style={{ margin: "6px 0 16px", color: "#666" }}>
                  Client Org: <b>{client.clientOrgId || "Not linked"}</b> | Total designs:{" "}
                  <b>{client.total}</b>
                </p>

                {client.approvers.map((approver: any) => (
                  <div key={approver.approverKey} style={approverBlock}>
                    <h3 style={{ marginTop: 0 }}>
                      Approver: {approver.approverEmail || "Not assigned"}
                    </h3>

                    <div style={{ display: "grid", gap: 12 }}>
                      {approver.designs.map((d: any) => (
                        <DesignRow key={d.id} d={d} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function groupByClientAndApprover(designs: any[]) {
  const clientMap = new Map<string, any>();

  for (const d of designs) {
    const clientOrgId = d.clientOrgId || "unlinked_client";
    const clientName = d.customerName || d.clientName || d.clientOrgName || clientOrgId || "Unlinked Client";
    const clientKey = clientOrgId || clientName;

    if (!clientMap.has(clientKey)) {
      clientMap.set(clientKey, {
        clientKey,
        clientOrgId,
        clientName,
        total: 0,
        approverMap: new Map<string, any>(),
      });
    }

    const client = clientMap.get(clientKey);
    client.total += 1;

    const emails =
      Array.isArray(d.assignedApproverEmails) && d.assignedApproverEmails.length
        ? d.assignedApproverEmails
        : [d.latestApprovalRecipientEmail || d.approverEmail || "not_assigned"];

    for (const email of emails) {
      const approverKey = String(email || "not_assigned").toLowerCase();

      if (!client.approverMap.has(approverKey)) {
        client.approverMap.set(approverKey, {
          approverKey,
          approverEmail: approverKey === "not_assigned" ? "" : approverKey,
          designs: [],
        });
      }

      client.approverMap.get(approverKey).designs.push(d);
    }
  }

  return Array.from(clientMap.values()).map((client) => ({
    ...client,
    approvers: Array.from(client.approverMap.values()),
  }));
}

function DesignRow({ d }: any) {
  return (
    <div style={designRow}>
      <div>
        <h3 style={{ margin: 0 }}>{d.title || "Untitled Design"}</h3>

        <p style={{ margin: "6px 0", color: "#555" }}>
          Version: <b>V{d.currentVersion || 1}</b> | Status: <StatusBadge status={d.status} /> | Stage:{" "}
          <b>{d.approvalStage || "-"}</b>
        </p>

        <p style={{ margin: "6px 0", color: "#666" }}>
          Last note by: {d.lastNoteBy || "-"} | Last note at: {formatDate(d.lastNoteAt)}
        </p>

        {d.latestFileUrl && (
          <a href={d.latestFileUrl} target="_blank" style={{ color: "#2563eb", fontWeight: 700 }}>
            Open latest file
          </a>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <a href={`/design-thread/${d.id}`} style={darkButton}>
          Open Thread
        </a>
      </div>
    </div>
  );
}

function StatusBadge({ status }: any) {
  const label = status || "-";

  return (
    <span style={{
      padding: "3px 8px",
      borderRadius: 999,
      background: status === "revision_requested" ? "#fee2e2" :
        status === "approved" ? "#dcfce7" :
        status === "frozen" ? "#dbeafe" : "#f3f4f6",
      fontWeight: 700,
      fontSize: 12,
    }}>
      {label}
    </span>
  );
}

function Stat({ title, value }: any) {
  return (
    <div style={statCard}>
      <div style={{ color: "#666", fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function Empty({ text }: any) {
  return (
    <div style={{ padding: 16, background: "#f9fafb", border: "1px solid #eee", borderRadius: 10 }}>
      {text}
    </div>
  );
}

function formatDate(v: any) {
  if (!v?.seconds) return "-";
  return new Date(v.seconds * 1000).toLocaleString();
}

const statGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 16,
  marginTop: 20,
};

const statCard: React.CSSProperties = {
  padding: 18,
  border: "1px solid #ddd",
  borderRadius: 12,
  background: "white",
};

const primaryButton: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 16px",
  background: "#111827",
  color: "white",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 700,
};

const darkButton: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  background: "#111827",
  color: "white",
  borderRadius: 8,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const clientCard: React.CSSProperties = {
  padding: 20,
  border: "1px solid #ddd",
  borderRadius: 14,
  background: "white",
};

const approverBlock: React.CSSProperties = {
  padding: 16,
  marginTop: 14,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fafafa",
};

const designRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  padding: 14,
  border: "1px solid #ddd",
  borderRadius: 10,
  background: "white",
};
