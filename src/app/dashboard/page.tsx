"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebaseClient";
import { APP_NAME } from "@/lib/appConfig";

type UserProfile = {
  uid: string;
  email: string;
  name: string;
  tenantId: string;
  role: string;
};

type Design = {
  id: string;
  tenantId: string;
  title: string;
  customerName: string;
  status: string;
  createdAt?: any;
};

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }

      const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
      if (!userSnap.exists()) {
        router.push("/login");
        return;
      }

      const profile = userSnap.data() as UserProfile;
      setUser(profile);
      setLoading(false);
    });

    return () => unsubAuth();
  }, [router]);

  useEffect(() => {
    if (!user?.tenantId) return;

    const q = query(
      collection(db, "designs"),
      where("tenantId", "==", user.tenantId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setDesigns(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }))
      );
    });

    return () => unsub();
  }, [user?.tenantId]);

  async function createDesign(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setCreating(true);

    try {
      const designId = crypto.randomUUID();

      await setDoc(doc(db, "designs", designId), {
        id: designId,
        tenantId: user.tenantId,
        title,
        customerName,
        status: "pending",
        currentVersion: 1,
        createdBy: user.uid,
        createdByEmail: user.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, "auditLogs", crypto.randomUUID()), {
        tenantId: user.tenantId,
        actorUid: user.uid,
        actorEmail: user.email,
        action: "DESIGN_CREATED",
        module: "designs",
        targetType: "design",
        targetId: designId,
        message: `Design created: ${title}`,
        createdAt: serverTimestamp(),
      });

      setTitle("");
      setCustomerName("");
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(design: Design, status: "approved" | "rejected") {
    if (!user) return;

    await setDoc(doc(db, "designs", design.id), {
      ...design,
      status,
      approvedOrRejectedBy: user.uid,
      approvedOrRejectedByEmail: user.email,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await setDoc(doc(db, "auditLogs", crypto.randomUUID()), {
      tenantId: user.tenantId,
      actorUid: user.uid,
      actorEmail: user.email,
      action: status === "approved" ? "DESIGN_APPROVED" : "DESIGN_REJECTED",
      module: "designs",
      targetType: "design",
      targetId: design.id,
      message: `Design ${status}: ${design.title}`,
      createdAt: serverTimestamp(),
    });
  }

  if (loading) {
    return <main className="p-8">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold">{APP_NAME}</h1>
            <p className="text-sm text-slate-500">
              Tenant: {user?.tenantId} · Role: {user?.role}
            </p>
          </div>

          <button
            onClick={async () => {
              await signOut(auth);
              router.push("/login");
            }}
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
          >
            Logout
          </button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-8 md:grid-cols-[380px_1fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Create Design Approval</h2>
          <p className="mt-1 text-sm text-slate-500">
            V1 creates the approval record. File upload comes next.
          </p>

          <form onSubmit={createDesign} className="mt-5 space-y-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Design title / style name"
              className="w-full rounded-xl border px-4 py-3"
            />

            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
              placeholder="Customer / brand name"
              className="w-full rounded-xl border px-4 py-3"
            />

            <button
              disabled={creating}
              className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Approval"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Design Approvals</h2>

          <div className="mt-5 space-y-3">
            {designs.length === 0 && (
              <div className="rounded-xl border border-dashed p-6 text-center text-slate-500">
                No designs yet.
              </div>
            )}

            {designs.map((d) => (
              <div
                key={d.id}
                className="rounded-xl border p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-bold">{d.title}</h3>
                    <p className="text-sm text-slate-500">
                      Customer: {d.customerName}
                    </p>
                    <span className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase">
                      {d.status}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => updateStatus(d, "approved")}
                      className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => updateStatus(d, "rejected")}
                      className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
