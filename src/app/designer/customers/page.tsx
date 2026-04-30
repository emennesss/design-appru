"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebaseClient";
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from "firebase/firestore";

type UserProfile = {
  uid: string;
  email: string;
  tenantId: string;
  role: string;
};

type Design = {
  id: string;
  tenantId?: string;
  title?: string;
  customerName?: string;
  status?: string;
  approvalStage?: string;
  currentVersion?: number;
  latestFileUrl?: string;
  latestFileName?: string;
  latestFileType?: string;
  latestApprovalToken?: string;
  latestApprovalRecipientEmail?: string;
  clientNotes?: string;
  adminDimensions?: {
    length?: string;
    width?: string;
    height?: string;
  } | null;
  clientDimensions?: {
    length?: string;
    width?: string;
    height?: string;
  } | null;
  updatedAt?: any;
};

export default function DesignerCustomersPage() {
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [customerFilter, setCustomerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("latest");
  const [search, setSearch] = useState("");

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

      setUser(userSnap.data() as UserProfile);
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

  const customers = useMemo(() => {
    const set = new Set<string>();
    for (const d of designs) {
      if (d.customerName) set.add(d.customerName);
      if (d.latestApprovalRecipientEmail) set.add(d.latestApprovalRecipientEmail);
    }
    return Array.from(set).sort();
  }, [designs]);

  const visible = useMemo(() => {
    let list = [...designs];

    if (customerFilter !== "all") {
      list = list.filter(
        (d) =>
          d.customerName === customerFilter ||
          d.latestApprovalRecipientEmail === customerFilter
      );
    }

    if (statusFilter !== "all") {
      list = list.filter((d) => (d.status || "").toLowerCase() === statusFilter);
    }

    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter((d) =>
        [
          d.title,
          d.customerName,
          d.latestApprovalRecipientEmail,
          d.status,
          d.latestFileName,
        ]
          .join(" ")
          .toLowerCase()
          .includes(s)
      );
    }

    list.sort((a, b) => {
      if (sortBy === "customer") return (a.customerName || "").localeCompare(b.customerName || "");
      if (sortBy === "title") return (a.title || "").localeCompare(b.title || "");
      if (sortBy === "status") return (a.status || "").localeCompare(b.status || "");
      if (sortBy === "version") return (b.currentVersion || 0) - (a.currentVersion || 0);
      return String(b.updatedAt?.seconds || "").localeCompare(String(a.updatedAt?.seconds || ""));
    });

    return list;
  }, [designs, customerFilter, statusFilter, sortBy, search]);

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Customer Files & Approvals</h1>
          <p className="mt-1 text-sm text-slate-500">
            View all customer-linked designs, files, versions and approval status.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files / customers"
              className="rounded-xl border px-4 py-3"
            />

            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="rounded-xl border px-4 py-3"
            >
              <option value="all">All customers</option>
              {customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border px-4 py-3"
            >
              <option value="all">All statuses</option>
              <option value="sent">Sent</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-xl border px-4 py-3"
            >
              <option value="latest">Sort: Latest updated</option>
              <option value="customer">Sort: Customer</option>
              <option value="title">Sort: Title</option>
              <option value="status">Sort: Status</option>
              <option value="version">Sort: Version</option>
            </select>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {visible.length === 0 && (
            <div className="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm">
              No matching files.
            </div>
          )}

          {visible.map((d) => (
            <div key={d.id} className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-[160px_1fr_180px]">
                <div className="rounded-xl border bg-slate-50 p-2">
                  {d.latestFileUrl && d.latestFileType?.startsWith("image/") ? (
                    <img
                      src={d.latestFileUrl}
                      alt={d.latestFileName || d.title || "Design"}
                      className="h-36 w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-36 items-center justify-center text-sm text-slate-500">
                      No preview
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="text-lg font-bold">{d.title || "Untitled Design"}</h2>
                  <p className="text-sm text-slate-500">
                    Customer: {d.customerName || "-"}
                  </p>
                  <p className="text-sm text-slate-500">
                    Email: {d.latestApprovalRecipientEmail || "-"}
                  </p>
                  <p className="text-sm text-slate-500">
                    Version: V{d.currentVersion || 1}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase">
                      {d.status || "pending"}
                    </span>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase text-blue-700">
                      {d.approvalStage || "needs_approval"}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="font-bold">Admin dimensions</p>
                      <p>
                        L: {d.adminDimensions?.length || "-"} · W: {d.adminDimensions?.width || "-"} · H: {d.adminDimensions?.height || "-"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-green-50 p-3">
                      <p className="font-bold text-green-800">Client dimensions</p>
                      <p>
                        L: {d.clientDimensions?.length || "-"} · W: {d.clientDimensions?.width || "-"} · H: {d.clientDimensions?.height || "-"}
                      </p>
                      {d.clientNotes && (
                        <p className="mt-1 text-green-800">Notes: {d.clientNotes}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {d.latestApprovalToken && (
                    <a
                      href={`/client-approval/${d.latestApprovalToken}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-bold text-white"
                    >
                      Open Approval
                    </a>
                  )}

                  {d.latestFileUrl && (
                    <a
                      href={d.latestFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border px-4 py-3 text-center text-sm font-bold"
                    >
                      Open File
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
