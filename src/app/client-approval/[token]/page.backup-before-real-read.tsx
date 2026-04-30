"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

export default function ClientApprovalPage() {
  const { token } = useParams();

  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (decision: "approved" | "rejected") => {
    setLoading(true);

    const res = await fetch("/api/approval-links/submit", {
      method: "POST",
      body: JSON.stringify({
        token,
        decision,
        dimensions: {
          length,
          width,
          height,
        },
        notes,
      }),
    });

    const json = await res.json();

    setLoading(false);

    if (json.error) {
      setMessage(json.error);
      return;
    }

    setDone(true);
    setMessage("Decision submitted. Cannot be changed.");
  };

  if (done) {
    return (
      <div className="p-10 text-center text-xl font-bold">
        ✅ {message}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">

      <h1 className="text-2xl font-bold">Design Approval</h1>

      <img src={`/api/preview?token=${token}`} className="w-full rounded" />

      <input
        placeholder="Length (cm)"
        value={length}
        onChange={(e) => setLength(e.target.value)}
        className="border p-2 w-full"
      />

      <input
        placeholder="Width (cm)"
        value={width}
        onChange={(e) => setWidth(e.target.value)}
        className="border p-2 w-full"
      />

      <input
        placeholder="Height (cm)"
        value={height}
        onChange={(e) => setHeight(e.target.value)}
        className="border p-2 w-full"
      />

      <textarea
        placeholder="Notes / instructions"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="border p-2 w-full"
      />

      <div className="flex gap-4">
        <button
          onClick={() => submit("approved")}
          disabled={loading}
          className="bg-green-600 text-white px-4 py-2 rounded w-full"
        >
          Approve
        </button>

        <button
          onClick={() => submit("rejected")}
          disabled={loading}
          className="bg-red-600 text-white px-4 py-2 rounded w-full"
        >
          Reject
        </button>
      </div>

      {message && <p className="text-red-600">{message}</p>}
    </div>
  );
}
