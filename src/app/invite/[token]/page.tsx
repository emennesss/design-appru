"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/lib/firebaseClient";
import { homePathForRole } from "@/lib/permissions";

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();

  const token = String(params.token || "");

  const [invite, setInvite] = useState<any>(null);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadInvite() {
      try {
        const res = await fetch(`/api/invites/read?token=${encodeURIComponent(token)}`);
        const json = await res.json();

        if (!res.ok) throw new Error(json.error || "Invite not found");

        setInvite(json.invite);
      } catch (err: any) {
        setError(err?.message || "Could not load invite");
      } finally {
        setLoading(false);
      }
    }

    if (token) loadInvite();
  }, [token]);

  async function acceptInvite(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setInfo("");
    setSubmitting(true);

    try {
      let cred;

      if (mode === "signup") {
        cred = await createUserWithEmailAndPassword(auth, invite.email, password);
        await sendEmailVerification(cred.user);
      } else {
        cred = await signInWithEmailAndPassword(auth, invite.email, password);
      }

      const idToken = await cred.user.getIdToken();

      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error || "Could not accept invite");

      setInfo("Invite accepted. Opening your dashboard...");
      router.push(homePathForRole(invite.role));
    } catch (err: any) {
      setError(err?.message || "Invite acceptance failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main style={{ padding: 24 }}>Loading invite...</main>;
  }

  if (error && !invite) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Invite Error</h1>
        <p style={{ color: "crimson" }}>{error}</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 460, background: "white", borderRadius: 18, padding: 28, boxShadow: "0 20px 60px rgba(15,23,42,.12)" }}>
        <h1 style={{ margin: 0 }}>Accept Invite</h1>

        <p style={{ color: "#64748b" }}>
          You were invited as <b>{invite?.roleLabel}</b>.
        </p>

        <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <div><b>Email:</b> {invite?.email}</div>
          <div><b>Role:</b> {invite?.roleLabel}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={() => setMode("signup")} style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", background: mode === "signup" ? "#0f172a" : "white", color: mode === "signup" ? "white" : "#0f172a" }}>
            Create Account
          </button>
          <button type="button" onClick={() => setMode("login")} style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", background: mode === "login" ? "#0f172a" : "white", color: mode === "login" ? "white" : "#0f172a" }}>
            Existing Login
          </button>
        </div>

        <form onSubmit={acceptInvite} style={{ marginTop: 20 }}>
          <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>
            Password
          </label>

          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={6}
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1" }}
          />

          {error && <p style={{ color: "crimson" }}>{error}</p>}
          {info && <p style={{ color: "green" }}>{info}</p>}

          <button disabled={submitting} style={{ width: "100%", marginTop: 18, padding: 13, borderRadius: 12, border: 0, background: "#0f172a", color: "white", fontWeight: 800 }}>
            {submitting ? "Please wait..." : mode === "signup" ? "Create account & accept invite" : "Login & accept invite"}
          </button>
        </form>
      </div>
    </main>
  );
}
