"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";

type Dimensions = {
  length?: string;
  width?: string;
  height?: string;
};

type ApprovalData = {
  token: string;
  link: {
    id: string;
    recipientEmail: string;
    status: string;
    finalized: boolean;
    adminDimensions?: Dimensions | null;
    clientDimensions?: Dimensions | null;
    clientNotes?: string;
  };
  design: {
    id: string;
    title: string;
    customerName: string;
    status: string;
    approvalStage?: string;
    currentVersion: number;
    latestFileUrl: string;
    latestFileName: string;
    latestFileType: string;
    adminDimensions?: Dimensions | null;
    clientDimensions?: Dimensions | null;
    clientNotes?: string;
  };
};

export default function ClientApprovalPage() {
  const params = useParams();
  const token = String(params.token || "");

  const [data, setData] = useState<ApprovalData | null>(null);
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const [password, setPassword] = useState("");
  const [signupMessage, setSignupMessage] = useState("");
  const [signingUp, setSigningUp] = useState(false);

  async function loadApproval() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/approval-links/read?token=${encodeURIComponent(token)}`);
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || "Could not load approval.");

      setData(json);

      const adminDims = json.design?.adminDimensions || json.link?.adminDimensions || {};
      setLength(adminDims.length || "");
      setWidth(adminDims.width || "");
      setHeight(adminDims.height || "");
    } catch (err: any) {
      setMessage(err?.message || "Could not load approval.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadApproval();
  }, [token]);

  async function submit(decision: "approved" | "rejected") {
    setSubmitting(true);
    setMessage("");

    try {
      const res = await fetch("/api/approval-links/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          decision,
          dimensions: { length, width, height },
          notes,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not submit decision.");

      setMessage("Decision submitted successfully. This cannot be changed.");
      await loadApproval();
    } catch (err: any) {
      setMessage(err?.message || "Could not submit decision.");
    } finally {
      setSubmitting(false);
    }
  }

  async function createClientAccount() {
    if (!data?.link.recipientEmail) {
      setSignupMessage("No client email found for this approval link.");
      return;
    }

    if (password.length < 6) {
      setSignupMessage("Password must be at least 6 characters.");
      return;
    }

    setSigningUp(true);
    setSignupMessage("");

    try {
      await createUserWithEmailAndPassword(auth, data.link.recipientEmail, password);
      setSignupMessage("Account created. Opening your dashboard...");
      window.location.href = "/client/dashboard";
    } catch (err: any) {
      if (err?.code === "auth/email-already-in-use") {
        try {
          await signInWithEmailAndPassword(auth, data.link.recipientEmail, password);
          setSignupMessage("Logged in. Opening your dashboard...");
          window.location.href = "/client/dashboard";
        } catch {
          setSignupMessage("Account already exists. Use the correct password or reset password later.");
        }
      } else {
        setSignupMessage(err?.message || "Could not create account.");
      }
    } finally {
      setSigningUp(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-slate-100 p-8">Loading approval...</main>;
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-red-700">Approval not available</h1>
          <p className="mt-2 text-slate-600">{message}</p>
        </div>
      </main>
    );
  }

  const fileType = data.design.latestFileType || "";
  const isImage = fileType.startsWith("image/");
  const isPdf = fileType.includes("pdf");
  const finalized = data.link.finalized;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm">
        <div className="border-b pb-4">
          <h1 className="text-2xl font-bold">Design Approval</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review the design carefully before submitting your decision.
          </p>
        </div>

        <div className="mt-5">
          <h2 className="text-xl font-bold">{data.design.title}</h2>
          <p className="text-sm text-slate-500">Customer: {data.design.customerName}</p>
          <p className="text-sm text-slate-500">Version: V{data.design.currentVersion}</p>

          <span className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase">
            {data.design.status}
          </span>
        </div>

        <div className="mt-6 rounded-xl border bg-slate-50 p-4">
          <p className="mb-3 text-sm font-bold text-slate-700">Design file</p>

          {isImage && (
            <img
              src={data.design.latestFileUrl}
              alt={data.design.latestFileName || data.design.title}
              className="max-h-[520px] w-full rounded-xl object-contain"
            />
          )}

          {isPdf && (
            <iframe
              src={data.design.latestFileUrl}
              className="h-[600px] w-full rounded-xl border bg-white"
            />
          )}

          {!isImage && !isPdf && (
            <div className="rounded-xl border bg-white p-5 text-sm text-slate-600">
              This file type cannot be previewed directly in the browser yet.
            </div>
          )}

          <a
            href={data.design.latestFileUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block break-all text-sm font-semibold text-blue-700 underline"
          >
            Open / download file: {data.design.latestFileName || "View file"}
          </a>
        </div>

        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h3 className="font-bold text-blue-900">Optional: create your customer dashboard</h3>
          <p className="mt-1 text-sm text-blue-800">
            Use this to track all future designs, approvals, revisions and history.
          </p>

          <input
            value={data.link.recipientEmail || ""}
            disabled
            className="mt-3 w-full rounded-xl border bg-white px-4 py-3 text-sm"
          />

          <input
            type="password"
            placeholder="Create password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-3 w-full rounded-xl border bg-white px-4 py-3 text-sm"
          />

          <button
            onClick={createClientAccount}
            disabled={signingUp}
            className="mt-3 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {signingUp ? "Creating..." : "Create / Open Dashboard"}
          </button>

          {signupMessage && (
            <p className="mt-3 text-sm font-semibold text-blue-900">{signupMessage}</p>
          )}
        </div>

        {finalized ? (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5">
            <h3 className="font-bold text-green-800">Decision already finalized</h3>
            <p className="mt-1 text-sm text-green-700">
              This approval has already been submitted and cannot be changed.
            </p>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border p-5">
            <h3 className="font-bold">Confirm product dimensions</h3>
            <p className="mt-1 text-sm text-slate-500">
              Required for approval. If rejecting, explain the revision needed.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <input placeholder="Length (cm)" value={length} onChange={(e) => setLength(e.target.value)} className="rounded-xl border px-4 py-3" />
              <input placeholder="Width (cm)" value={width} onChange={(e) => setWidth(e.target.value)} className="rounded-xl border px-4 py-3" />
              <input placeholder="Height (cm)" value={height} onChange={(e) => setHeight(e.target.value)} className="rounded-xl border px-4 py-3" />
            </div>

            <textarea
              placeholder="Notes / revision instructions"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-3 min-h-28 w-full rounded-xl border px-4 py-3"
            />

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button onClick={() => submit("approved")} disabled={submitting} className="rounded-xl bg-green-600 px-4 py-3 font-bold text-white disabled:opacity-50">
                {submitting ? "Submitting..." : "Approve Design"}
              </button>

              <button onClick={() => submit("rejected")} disabled={submitting} className="rounded-xl bg-red-600 px-4 py-3 font-bold text-white disabled:opacity-50">
                {submitting ? "Submitting..." : "Reject / Request Revision"}
              </button>
            </div>
          </div>
        )}

        {message && (
          <div className="mt-5 rounded-xl bg-slate-100 p-4 text-sm font-semibold text-slate-700">
            {message}
          </div>
        )}
      </div>
    </main>
  );
}
