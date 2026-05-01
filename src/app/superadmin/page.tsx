"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebaseClient";
import { SUPERADMIN_EMAIL } from "@/lib/superadminGuard";
import TopBar from "@/components/TopBar";

export default function SuperadminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);

  async function load() {
    const email = auth.currentUser?.email?.toLowerCase() || "";

    const res = await fetch("/api/superadmin/stats", {
      headers: { "x-user-email": email },
    }).then((r) => r.json());

    setStats(res);
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      const email = user?.email?.toLowerCase() || "";

      if (!user) {
        router.push("/login");
        return;
      }

      if (email !== SUPERADMIN_EMAIL) {
        router.push("/dashboard");
        return;
      }

      load();
    });

    return () => unsub();
  }, [router]);

  return (
    <div>
      <TopBar />

      <div style={{ padding: 20 }}>
        <h1>Superadmin Dashboard</h1>

        <a
          href="/superadmin/controls"
          style={{
            display: "inline-block",
            marginBottom: 20,
            padding: "10px 14px",
            background: "#111827",
            color: "white",
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          Open Superadmin Controls
        </a>

        {!stats && <div>Loading...</div>}

        {stats && (
          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(3, 1fr)" }}>
            <Card title="Designers" value={stats.designers} />
            <Card title="Clients" value={stats.clients} />
            <Card title="Designs" value={stats.designs} />
            <Card title="Active Links" value={stats.links} />
            <Card title="Pending Approvals" value={stats.pending} />
            <Card title="Frozen Designs" value={stats.frozen} />
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ title, value }: any) {
  return (
    <div style={{ padding: 20, background: "#f4f4f4", borderRadius: 8 }}>
      <h3>{title}</h3>
      <h1>{value}</h1>
    </div>
  );
}
