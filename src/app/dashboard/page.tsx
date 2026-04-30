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
  updateDoc,
  where,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebaseClient";
import { APP_NAME } from "@/lib/appConfig";
import { compressImageForApproval } from "@/lib/imageCompression";

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
  currentVersion: number;
  latestFileUrl?: string;
  latestFileName?: string;
};

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  const [uploadingDesignId, setUploadingDesignId] = useState<string | null>(null);

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

  async function uploadDesignFile(params: {
    designId: string;
    versionNo: number;
    fileToUpload: File;
  }) {
    if (!user) throw new Error("User missing");

    const uploadFile = await compressImageForApproval(params.fileToUpload);

    const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    const storagePath = `tenants/${user.tenantId}/designs/${params.designId}/versions/v${params.versionNo}/${Date.now()}-${safeName}`;

    const fileRef = ref(storage, storagePath);

    await uploadBytes(fileRef, uploadFile, {
      contentType: uploadFile.type || "application/octet-stream",
    });

    const downloadUrl = await getDownloadURL(fileRef);

    return {
      storagePath,
      downloadUrl,
      fileName: uploadFile.name,
      originalFileName: params.fileToUpload.name,
      fileSize: uploadFile.size,
      originalFileSize: params.fileToUpload.size,
      fileType: uploadFile.type || "unknown",
      wasCompressed: uploadFile.name !== params.fileToUpload.name,
    };
  }

  async function createDesign(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !file) return;

    setCreating(true);

    try {
      const designId = crypto.randomUUID();
      const versionId = crypto.randomUUID();

      const uploaded = await uploadDesignFile({
        designId,
        versionNo: 1,
        fileToUpload: file,
      });

      await setDoc(doc(db, "designs", designId), {
        id: designId,
        tenantId: user.tenantId,
        title,
        customerName,
        status: "pending",
        currentVersion: 1,
        latestVersionId: versionId,
        latestFileUrl: uploaded.downloadUrl,
        latestFileName: uploaded.fileName,
        latestStoragePath: uploaded.storagePath,
        createdBy: user.uid,
        createdByEmail: user.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, "designVersions", versionId), {
        id: versionId,
        tenantId: user.tenantId,
        designId,
        versionNo: 1,
        status: "current",
        fileName: uploaded.fileName,
        fileSize: uploaded.fileSize,
        fileType: uploaded.fileType,
        fileUrl: uploaded.downloadUrl,
        storagePath: uploaded.storagePath,
        uploadedBy: user.uid,
        uploadedByEmail: user.email,
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, "auditLogs", crypto.randomUUID()), {
        tenantId: user.tenantId,
        actorUid: user.uid,
        actorEmail: user.email,
        action: "DESIGN_CREATED_WITH_FILE",
        module: "designs",
        targetType: "design",
        targetId: designId,
        message: `Design created with V1 file: ${title}`,
        createdAt: serverTimestamp(),
      });

      setTitle("");
      setCustomerName("");
      setFile(null);

      const fileInput = document.getElementById("design-file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    } finally {
      setCreating(false);
    }
  }

  async function uploadNewVersion(design: Design, fileToUpload: File) {
    if (!user) return;

    setUploadingDesignId(design.id);

    try {
      const nextVersion = (design.currentVersion || 1) + 1;
      const versionId = crypto.randomUUID();

      const uploaded = await uploadDesignFile({
        designId: design.id,
        versionNo: nextVersion,
        fileToUpload,
      });

      await setDoc(doc(db, "designVersions", versionId), {
        id: versionId,
        tenantId: user.tenantId,
        designId: design.id,
        versionNo: nextVersion,
        status: "current",
        fileName: uploaded.fileName,
        fileSize: uploaded.fileSize,
        fileType: uploaded.fileType,
        fileUrl: uploaded.downloadUrl,
        storagePath: uploaded.storagePath,
        uploadedBy: user.uid,
        uploadedByEmail: user.email,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "designs", design.id), {
        status: "pending",
        currentVersion: nextVersion,
        latestVersionId: versionId,
        latestFileUrl: uploaded.downloadUrl,
        latestFileName: uploaded.fileName,
        latestStoragePath: uploaded.storagePath,
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, "auditLogs", crypto.randomUUID()), {
        tenantId: user.tenantId,
        actorUid: user.uid,
        actorEmail: user.email,
        action: "DESIGN_VERSION_UPLOADED",
        module: "designs",
        targetType: "design",
        targetId: design.id,
        message: `V${nextVersion} uploaded for: ${design.title}`,
        createdAt: serverTimestamp(),
      });
    } finally {
      setUploadingDesignId(null);
    }
  }

  async function updateStatus(design: Design, status: "approved" | "rejected") {
    if (!user) return;

    await updateDoc(doc(db, "designs", design.id), {
      status,
      approvedOrRejectedBy: user.uid,
      approvedOrRejectedByEmail: user.email,
      updatedAt: serverTimestamp(),
    });

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
            Upload the first design file. This becomes Version 1.
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

            <input
              id="design-file"
              type="file"
              required
              accept="image/*,.pdf,.ai,.psd,.cdr,.zip"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full rounded-xl border bg-white px-4 py-3"
            />

            <button
              disabled={creating || !file}
              className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {creating ? "Uploading..." : "Create Approval with File"}
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
              <div key={d.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-bold">{d.title}</h3>
                    <p className="text-sm text-slate-500">
                      Customer: {d.customerName}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Version: V{d.currentVersion || 1}
                    </p>

                    <span className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase">
                      {d.status}
                    </span>

                    {d.latestFileUrl && (
                      <div className="mt-3">
                        <a
                          href={d.latestFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-blue-700 underline"
                        >
                          Open latest file: {d.latestFileName || "View file"}
                        </a>
                      </div>
                    )}

                    <div className="mt-4">
                      <label className="block text-xs font-semibold text-slate-500">
                        Upload revised version
                      </label>
                      <input
                        type="file"
                        accept="image/*,.pdf,.ai,.psd,.cdr,.zip"
                        disabled={uploadingDesignId === d.id}
                        onChange={(e) => {
                          const selectedFile = e.target.files?.[0];
                          if (selectedFile) uploadNewVersion(d, selectedFile);
                          e.currentTarget.value = "";
                        }}
                        className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
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

                {uploadingDesignId === d.id && (
                  <p className="mt-3 text-sm font-semibold text-slate-500">
                    Uploading new version...
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
