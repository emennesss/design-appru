"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";
import { APP_NAME, DEFAULT_TENANT_ID } from "@/lib/appConfig";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("123456");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("Default Company");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const userCred = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        const userId = userCred.user.uid;
        const tenantId = DEFAULT_TENANT_ID;

        await setDoc(doc(db, "tenants", tenantId), {
          tenantId,
          name: companyName || "Default Company",
          status: "active",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });

        await setDoc(doc(db, "users", userId), {
          uid: userId,
          tenantId,
          email,
          name: name || email,
          role: "superadmin",
          status: "active",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });

        await setDoc(doc(db, "auditLogs", crypto.randomUUID()), {
          tenantId,
          actorUid: userId,
          actorEmail: email,
          action: "USER_SIGNUP",
          module: "auth",
          targetType: "user",
          targetId: userId,
          message: "User signed up and default tenant was created/updated.",
          createdAt: serverTimestamp(),
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);

        const uid = auth.currentUser?.uid;
        if (uid) {
          const snap = await getDoc(doc(db, "users", uid));
          if (!snap.exists()) {
            await setDoc(doc(db, "users", uid), {
              uid,
              tenantId: DEFAULT_TENANT_ID,
              email,
              name: email,
              role: "superadmin",
              status: "active",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }, { merge: true });
          }
        }
      }

      router.push("/dashboard");
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
          Login or create your first tenant account.
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-lg py-2 text-sm font-semibold ${
              mode === "login" ? "bg-white shadow" : "text-slate-500"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-lg py-2 text-sm font-semibold ${
              mode === "signup" ? "bg-white shadow" : "text-slate-500"
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border px-4 py-3"
              />
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company / Tenant name"
                className="w-full rounded-xl border px-4 py-3"
              />
            </>
          )}

          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="Email"
            className="w-full rounded-xl border px-4 py-3"
          />

          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            placeholder="Password"
            className="w-full rounded-xl border px-4 py-3"
          />

          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Please wait..." : mode === "signup" ? "Create account" : "Login"}
          </button>
        </form>
      </div>
    </main>
  );
}
