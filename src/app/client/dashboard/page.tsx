"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import TopBar from "@/components/TopBar";
import { auth } from "@/lib/firebaseClient";

export default function ClientDashboardPage() {
  const router = useRouter(
  );

  const [email, setEmail] = useState(""
  );
  const [designs, setDesigns] = useState<any[]>([]
  );
  const [loading, setLoading] = useState(true
  );

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user?.email) {
        router.push("/login"
  );
        return;
      }

      const e = user.email.toLowerCase(
  );
      setEmail(e
  );

      const res = await fetch(`/api/client/designs?email=${encodeURIComponent(e)}`).then(r => r.json()
  );

      setDesigns(res.designs || []
  );
      setLoading(false
  );
    }
  );

    return (
    ) => unsub(
  );
  }, [router]
  );

  if (loading) {
    return (
    
      <div>
        <TopBar />
        <div style={{ padding: 24 }}>Loading approver dashboard...</div>
      </div>
    
  );
  }

  return (
    
    <div>
      <TopBar />

      <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        <h1>Approver Dashboard</h1>
        <p>Logged in as: <b>{email}</b></p>

        {designs.length === 0 && <p>No designs assigned yet.</p>}

        <div style={{ display: "grid", gap: 14 }}>
          {designs.map((d) => (
            <div key={d.id} style={card}>
              <h2>{d.title || "Untitled Design"}</h2>

              <p><b>Status:</b> {d.status}</p>
              <p><b>Stage:</b> {d.approvalStage}</p>
              <p><b>Version:</b> V{d.currentVersion}</p>

              <button
                onClick={() => router.push(`/design-thread/${d.id}`)}
                style={button}
              >
                Open Design Thread
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  
  );
}

const card: React.CSSProperties = {
  padding: 16,
  border: "1px solid #ddd",
  borderRadius: 12,
  background: "white",
};

const button: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  border: 0,
  borderRadius: 8,
  background: "#111827",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};
