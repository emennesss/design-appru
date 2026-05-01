"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebaseClient";
import { collection, onSnapshot, query, where } from "firebase/firestore";

type Design = {
  id: string;
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
  updatedAt?: any;
};

export default function ClientFilesPage() {
  const [email, setEmail] = useState("");
  const [designs, setDesigns] = useState<Design[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("latest");

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) {
        window.location.href = "/login";
        return;
      }
      setEmail(u.email || "");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!email) return;

    const q = query(
      collection(db, "designs"),
      where("assignedApproverEmails", "array-contains", email)
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
  }, [email]);

  const visible = useMemo(() => {
    let list = [...designs];

    if (statusFilter !== "all") {
      list = list.filter((d) => (d.status || "").toLowerCase() === statusFilter);
    }

    list.sort((a, b) => {
      if (sortBy === "title") return (a.title || "").localeCompare(b.title || "");
      if (sortBy === "status") return (a.status || "").localeCompare(b.status || "");
      if (sortBy === "version") return (b.currentVersion || 0) - (a.currentVersion || 0);
      return String(b.updatedAt?.seconds || "").localeCompare(String(a.updatedAt?.seconds || ""));
    });

    return list;
  }, [designs, statusFilter, sortBy]);

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">My Files & Design Approvals</h1>
          <p className="mt-1 text-sm text-slate-500">
            Logged in as {email}
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
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
              <option value="title">Sort: Title</option>
              <option value="status">Sort: Status</option>
              <option value="version">Sort: Version</option>
            </select>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {visible.length === 0 && (
            <div className="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm">
              No files found.
            </div>
          )}

          {visible.map((d) => (
            <div key={d.id} className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold">{d.title || "Untitled Design"}</h2>
                  <p className="text-sm text-slate-500">
                    Customer: {d.customerName || "-"} · Version: V{d.currentVersion || 1}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase">
                      {d.status || "pending"}
                    </span>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase text-blue-700">
                      {d.approvalStage || "needs_approval"}
                    </span>
                  </div>

                  {d.latestFileUrl && d.latestFileType?.startsWith("image/") && (
                    <img
                      src={d.latestFileUrl}
                      alt={d.latestFileName || d.title || "Design"}
                      className="mt-4 max-h-72 w-full rounded-xl border object-contain"
                    />
                  )}

                  {d.latestFileUrl && (
                    <a
                      href={d.latestFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block break-all text-sm font-semibold text-blue-700 underline"
                    >
                      Open file: {d.latestFileName || "View file"}
                    </a>
                  )}
                </div>

                {d.latestApprovalToken && (
                  <a
                    href={`/client-approval/${d.latestApprovalToken}`}
                    className="rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-bold text-white"
                  >
                    Open Approval
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
