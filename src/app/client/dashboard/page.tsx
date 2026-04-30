"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebaseClient";
import { collection, onSnapshot, query, where } from "firebase/firestore";

type Design = {
  id: string;
  title: string;
  customerName: string;
  status: string;
  approvalStage?: string;
  latestFileUrl?: string;
  latestFileName?: string;
  latestFileType?: string;
  latestApprovalToken?: string;
};

export default function ClientDashboard() {
  const [userEmail, setUserEmail] = useState("");
  const [designs, setDesigns] = useState<Design[]>([]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) {
        window.location.href = "/login";
        return;
      }
      setUserEmail(u.email || "");
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!userEmail) return;

    const q = query(
      collection(db, "designs"),
      where("latestApprovalRecipientEmail", "==", userEmail)
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
  }, [userEmail]);

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">My Design Approvals</h1>

        {designs.length === 0 && (
          <div className="bg-white p-6 rounded-xl shadow">
            No designs assigned yet.
          </div>
        )}

        <div className="space-y-4">
          {designs.map((d) => (
            <div key={d.id} className="bg-white p-4 rounded-xl shadow">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-bold">{d.title}</h2>
                  <p className="text-sm text-gray-500">
                    {d.customerName}
                  </p>

                  <div className="flex gap-2 mt-2">
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {d.status}
                    </span>
                    <span className="text-xs bg-blue-100 px-2 py-1 rounded">
                      {d.approvalStage || "needs_approval"}
                    </span>
                  </div>
                </div>

                {d.latestApprovalToken && (
                  <a
                    href={`/client-approval/${d.latestApprovalToken}`}
                    className="bg-black text-white px-3 py-2 rounded text-sm"
                  >
                    Open
                  </a>
                )}
              </div>

              {d.latestFileUrl && d.latestFileType?.startsWith("image/") && (
                <img
                  src={d.latestFileUrl}
                  className="mt-3 max-h-60 object-contain rounded"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
