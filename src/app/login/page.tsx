"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";
import { APP_NAME } from "@/lib/appConfig";
import { homePathForRole } from "@/lib/permissions";

function slugifyCompany(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "company"
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("123456");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleResetPassword() {
    setError("");
    setInfo("");

    if (!email || !email.includes("@")) {
      setError("Enter your email first, then click Forgot password.");
      return;
    }

    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    setInfo("Password reset email sent. Check your inbox.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      if (mode === "signup") {
        if (!companyName.trim()) {
          throw new Error("Company name is required.");
        }

        const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const userId = userCred.user.uid;

        if (name.trim()) {
          await updateProfile(userCred.user, { displayName: name.trim() });
        }

        const tenantId = `${slugifyCompany(companyName)}-${userId.slice(0, 8)}`;

        await setDoc(
          doc(db, "tenants", tenantId),
          {
            tenantId,
            name: companyName.trim(),
            status: "active",
            ownerUid: userId,
            ownerEmail: cleanEmail,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        await setDoc(
          doc(db, "users", userId),
          {
            uid: userId,
            tenantId,
            email: cleanEmail,
            name: name.trim() || cleanEmail,
            role: "admin",
            status: "active",
            emailVerified: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        await setDoc(doc(db, "auditLogs", crypto.randomUUID()), {
          tenantId,
          actorUid: userId,
          actorEmail: cleanEmail,
          action: "COMPANY_SIGNUP",
          module: "auth",
          targetType: "tenant",
          targetId: tenantId,
          message: "New company account created with owner as admin.",
          createdAt: serverTimestamp(),
        });

        await sendEmailVerification(userCred.user);
        setInfo("Account created. Verification email sent. You can continue to dashboard.");
        router.push("/dashboard");
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const snap = await getDoc(doc(db, "users", cred.user.uid));

      if (!snap.exists()) {
        throw new Error("Login exists in Firebase, but no app user profile was found. Ask admin to add this user.");
      }

      const user = snap.data() as any;

      if (user.status !== "active") {
        throw new Error("Your account is not active.");
      }

      router.push(homePathForRole(user.role));
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-3xl font-bold text-slate-900">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-slate-500">
          Login or register your company account.
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
          <button type="button" onClick={() => setMode("login")} className={`rounded-lg py-2 text-sm font-semibold ${mode === "login" ? "bg-white shadow" : "text-slate-500"}`}>
            Login
          </button>
          <button type="button" onClick={() => setMode("signup")} className={`rounded-lg py-2 text-sm font-semibold ${mode === "signup" ? "bg-white shadow" : "text-slate-500"}`}>
            Register Company
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full rounded-xl border px-4 py-3" />
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required placeholder="Company name" className="w-full rounded-xl border px-4 py-3" />
            </>
          )}

          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="Email" className="w-full rounded-xl border px-4 py-3" />

          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="Password" className="w-full rounded-xl border px-4 py-3" />

          {mode === "login" && (
            <button type="button" onClick={handleResetPassword} className="text-sm font-semibold text-blue-700 underline">
              Forgot password?
            </button>
          )}

          {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {info && <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{info}</div>}

          <button disabled={loading} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {loading ? "Please wait..." : mode === "signup" ? "Create company account" : "Login"}
          </button>
        </form>
      </div>
    </main>
  );
}
