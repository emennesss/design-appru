"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebaseClient";
import { SUPERADMIN_EMAIL } from "@/lib/superadminGuard";
import TopBar from "@/components/TopBar";

const DESIGNER_ROLES = ["designer_owner", "designer_admin", "designer_staff"];
const CLIENT_ROLES = ["client_owner", "client_approver", "client_viewer"];

const emptyData = {
  users: [],
  designerOrganizations: [],
  clientOrganizations: [],
  organizationLinks: [],
};

export default function SuperadminControlsPage() {
  const router = useRouter();

  const [authEmail, setAuthEmail] = useState("");
  const [data, setData] = useState<any>(emptyData);
  const [loading, setLoading] = useState(true);

  const [designerOrgName, setDesignerOrgName] = useState("");
  const [clientOrgName, setClientOrgName] = useState("");
  const [clientPrimaryEmail, setClientPrimaryEmail] = useState("");

  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [userSide, setUserSide] = useState("designer");
  const [userRole, setUserRole] = useState("designer_staff");
  const [userDesignerOrgId, setUserDesignerOrgId] = useState("default");
  const [userClientOrgId, setUserClientOrgId] = useState("");

  const [linkDesignerOrgId, setLinkDesignerOrgId] = useState("");
  const [linkClientOrgId, setLinkClientOrgId] = useState("");

  async function load(email: string) {
    const res = await fetch("/api/superadmin/control", {
      headers: { "x-user-email": email },
    }).then((r) => r.json());

    if (res.error) {
      alert(res.error);
      setData(emptyData);
      return;
    }

    setData({
      users: res.users || [],
      designerOrganizations: res.designerOrganizations || [],
      clientOrganizations: res.clientOrganizations || [],
      organizationLinks: res.organizationLinks || [],
    });
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      const email = user?.email?.toLowerCase() || "";

      if (!user) {
        router.push("/login");
        return;
      }

      if (email !== SUPERADMIN_EMAIL) {
        router.push("/dashboard");
        return;
      }

      setAuthEmail(email);
      await load(email);
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  async function post(action: string, payload: any) {
    const res = await fetch("/api/superadmin/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-email": authEmail,
      },
      body: JSON.stringify({ action, ...payload }),
    }).then((r) => r.json());

    if (res.error) {
      alert(res.error);
      return;
    }

    alert("Saved");
    await load(authEmail);
  }

  const roles = userSide === "client" ? CLIENT_ROLES : DESIGNER_ROLES;

  if (loading) {
    return (
      <div>
        <TopBar />
        <div style={{ padding: 24 }}>Loading superadmin controls...</div>
      </div>
    );
  }

  return (
    <div>
      <TopBar />

      <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        <h1>Superadmin Controls</h1>
        <p style={{ color: "#666" }}>
          Manage designer companies, client companies, users and designer-client relationships.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Card title="Create Designer Organization">
            <input placeholder="Designer company name" value={designerOrgName} onChange={e => setDesignerOrgName(e.target.value)} style={inputStyle} />
            <button style={buttonStyle} onClick={() => post("createDesignerOrg", { name: designerOrgName })}>
              Create Designer Org
            </button>
          </Card>

          <Card title="Create Client Organization">
            <input placeholder="Client company name" value={clientOrgName} onChange={e => setClientOrgName(e.target.value)} style={inputStyle} />
            <input placeholder="Primary client email" value={clientPrimaryEmail} onChange={e => setClientPrimaryEmail(e.target.value)} style={inputStyle} />
            <button style={buttonStyle} onClick={() => post("createClientOrg", { name: clientOrgName, primaryEmail: clientPrimaryEmail })}>
              Create Client Org
            </button>
          </Card>

          <Card title="Create / Update User">
            <input placeholder="User email" value={userEmail} onChange={e => setUserEmail(e.target.value)} style={inputStyle} />
            <input placeholder="User name" value={userName} onChange={e => setUserName(e.target.value)} style={inputStyle} />

            <select value={userSide} onChange={e => {
              const side = e.target.value;
              setUserSide(side);
              setUserRole(side === "client" ? "client_approver" : "designer_staff");
            }} style={inputStyle}>
              <option value="designer">Designer Side</option>
              <option value="client">Client Side</option>
            </select>

            <select value={userRole} onChange={e => setUserRole(e.target.value)} style={inputStyle}>
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            {userSide === "designer" && (
              <select value={userDesignerOrgId} onChange={e => setUserDesignerOrgId(e.target.value)} style={inputStyle}>
                <option value="default">default</option>
                {(data.designerOrganizations || []).map((o: any) => (
                  <option key={o.id} value={o.id}>{o.name || o.id}</option>
                ))}
              </select>
            )}

            {userSide === "client" && (
              <select value={userClientOrgId} onChange={e => setUserClientOrgId(e.target.value)} style={inputStyle}>
                <option value="">Select client org</option>
                {(data.clientOrganizations || []).map((o: any) => (
                  <option key={o.id} value={o.id}>{o.name || o.id}</option>
                ))}
              </select>
            )}

            <button style={buttonStyle} onClick={() => post("createUser", {
              email: userEmail,
              name: userName,
              side: userSide,
              role: userRole,
              designerOrgId: userDesignerOrgId,
              clientOrgId: userClientOrgId,
            })}>
              Save User
            </button>
          </Card>

          <Card title="Link Designer ↔ Client">
            <select value={linkDesignerOrgId} onChange={e => setLinkDesignerOrgId(e.target.value)} style={inputStyle}>
              <option value="">Select designer org</option>
              {(data.designerOrganizations || []).map((o: any) => (
                <option key={o.id} value={o.id}>{o.name || o.id}</option>
              ))}
            </select>

            <select value={linkClientOrgId} onChange={e => setLinkClientOrgId(e.target.value)} style={inputStyle}>
              <option value="">Select client org</option>
              {(data.clientOrganizations || []).map((o: any) => (
                <option key={o.id} value={o.id}>{o.name || o.id}</option>
              ))}
            </select>

            <button style={buttonStyle} onClick={() => post("linkOrganizations", {
              designerOrgId: linkDesignerOrgId,
              clientOrgId: linkClientOrgId,
            })}>
              Link Organizations
            </button>
          </Card>
        </div>

        <Section title="Users">
          <Table rows={data.users || []} columns={["email", "name", "side", "role", "designerOrgId", "clientOrgId", "status"]} />
        </Section>

        <Section title="Designer Organizations">
          <Table rows={data.designerOrganizations || []} columns={["id", "name", "status"]} />
        </Section>

        <Section title="Client Organizations">
          <Table rows={data.clientOrganizations || []} columns={["id", "name", "primaryEmail", "status"]} />
        </Section>

        <Section title="Designer-Client Links">
          <Table rows={data.organizationLinks || []} columns={["id", "designerOrgId", "clientOrgId", "status", "relationshipType"]} />
        </Section>
      </div>
    </div>
  );
}

function Card({ title, children }: any) {
  return (
    <div style={{ padding: 20, border: "1px solid #ddd", borderRadius: 12, background: "white" }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </div>
  );
}

function Section({ title, children }: any) {
  return (
    <div style={{ marginTop: 30 }}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function Table({ rows, columns }: any) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "white" }}>
        <thead>
          <tr>
            {columns.map((c: string) => (
              <th key={c} style={thStyle}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r: any, i: number) => (
            <tr key={r.id || r.email || i}>
              {columns.map((c: string) => (
                <td key={c} style={tdStyle}>{String(r[c] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  marginBottom: 10,
  border: "1px solid #bbb",
  borderRadius: 8,
  fontSize: 15,
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  border: 0,
  borderRadius: 8,
  background: "#111827",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: 10,
  borderBottom: "1px solid #ddd",
  background: "#f3f4f6",
};

const tdStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #eee",
};
