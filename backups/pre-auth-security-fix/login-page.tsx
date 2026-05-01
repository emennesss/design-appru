"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "@/lib/firebaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function login() {
    if (!email || !password) {
      alert("Email and password required.");
      return;
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      const userEmail = cred.user.email?.toLowerCase() || "";

      const profileRes = await fetch(`/api/users/get?email=${encodeURIComponent(userEmail)}`);
      const profileJson = await profileRes.json();
      const profile = profileJson.user;

      if (!profile) {
        alert("User profile not found. Please contact admin.");
        return;
      }

      if (profile.role === "superadmin" || profile.systemRole === "superadmin") {
        router.push("/superadmin");
        return;
      }

      const roles = Array.isArray(profile.roles) ? profile.roles : [profile.side || profile.role];

      if (roles.includes("designer") || String(profile.role || "").startsWith("designer_")) {
        router.push("/dashboard");
        return;
      }

      if (roles.includes("client") || String(profile.role || "").startsWith("client_")) {
        router.push("/client/dashboard");
        return;
      }

      router.push("/dashboard");
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Login failed.");
    }
  }

  async function forgotPassword() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      alert("Enter your email first, then click Forgot Password.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      alert("Password reset email sent.");
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Could not send reset email.");
    }
  }

  return (
    <main style={page}>
      <div style={card}>
        <h1 style={{ marginBottom: 4 }}>Design Appru</h1>
        <p style={{ color: "#666", marginTop: 0 }}>Designer / Client Approval Portal</p>

        <input
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={input}
        />

        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={input}
        />

        <button onClick={login} style={button}>
          Login
        </button>

        <button onClick={forgotPassword} style={linkButton}>
          Forgot Password?
        </button>

        <div style={divider} />

        <p style={{ color: "#666", fontSize: 14 }}>
          New designer company or client company?
        </p>

        <a href="/register" style={outlineButton}>
          Request Company Registration
        </a>
      </div>
    </main>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f3f4f6",
  padding: 20,
};

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 430,
  padding: 28,
  background: "white",
  borderRadius: 16,
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: 13,
  marginBottom: 12,
  border: "1px solid #bbb",
  borderRadius: 10,
  fontSize: 15,
};

const button: React.CSSProperties = {
  width: "100%",
  padding: 13,
  border: 0,
  borderRadius: 10,
  background: "#111827",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 15,
};

const linkButton: React.CSSProperties = {
  width: "100%",
  marginTop: 10,
  padding: 10,
  border: 0,
  background: "transparent",
  color: "#2563eb",
  fontWeight: 700,
  cursor: "pointer",
};

const outlineButton: React.CSSProperties = {
  display: "block",
  textAlign: "center",
  width: "100%",
  padding: 12,
  border: "1px solid #111827",
  borderRadius: 10,
  color: "#111827",
  textDecoration: "none",
  fontWeight: 800,
};

const divider: React.CSSProperties = {
  height: 1,
  background: "#e5e7eb",
  margin: "18px 0",
};
