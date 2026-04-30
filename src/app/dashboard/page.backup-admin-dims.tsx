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
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
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
  latestFileType?: string;
};

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");

  const [uploadingDesignId, setUploadingDesignId] = useState<string | null>(null);
  const [versionUploadProgress, setVersionUploadProgress] = useState<Record<string, number>>({});
  const [approvalEmailByDesign, setApprovalEmailByDesign] = useState<Record<string, string>>({});
  const [approvalLinkByDesign, setApprovalLinkByDesign] = useState<Record<string, string>>({});
  const [creatingLinkForDesignId, setCreatingLinkForDesignId] = useState<string | null>(null);

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

  function onMainFileChange(selectedFile: File | null) {
    setFile(selectedFile);
    setLocalPreviewUrl("");

    if (selectedFile && selectedFile.type.startsWith("image/")) {
      setLocalPreviewUrl(URL.createObjectURL(selectedFile));
    }
  }

  async function uploadDesignFile(params: {
    designId: string;
    versionNo: number;
    fileToUpload: File;
    onProgress?: (progress: number) => void;
  }) {
    if (!user) throw new Error("User missing");

    const uploadFile = await compressImageForApproval(params.fileToUpload);

    const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    const storagePath = `tenants/${user.tenantId}/designs/${params.designId}/versions/v${params.versionNo}/${Date.now()}-${safeName}`;

    const fileRef = ref(storage, storagePath);

    const uploadTask = uploadBytesResumable(fileRef, uploadFile, {
      contentType: uploadFile.type || "application/octet-stream",
    });

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          params.onProgress?.(progress);
        },
        (uploadError) => reject(uploadError),
        () => resolve()
      );
    });

    const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

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
    setError("");
    setUploadProgress(0);

    try {
      const designId = crypto.randomUUID();
      const versionId = crypto.randomUUID();

      const uploaded = await uploadDesignFile({
        designId,
        versionNo: 1,
        fileToUpload: file,
        onProgress: setUploadProgress,
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
        latestFileType: uploaded.fileType,
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
        originalFileName: uploaded.originalFileName,
        fileSize: uploaded.fileSize,
        originalFileSize: uploaded.originalFileSize,
        fileType: uploaded.fileType,
        wasCompressed: uploaded.wasCompressed,
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
      setLocalPreviewUrl("");
      setUploadProgress(0);

      const fileInput = document.getElementById("design-file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setCreating(false);
    }
  }

  async function uploadNewVersion(design: Design, fileToUpload: File) {
    if (!user) return;

    setUploadingDesignId(design.id);
    setVersionUploadProgress((prev) => ({ ...prev, [design.id]: 0 }));

    try {
      const nextVersion = (design.currentVersion || 1) + 1;
      const versionId = crypto.randomUUID();

      const uploaded = await uploadDesignFile({
        designId: design.id,
        versionNo: nextVersion,
        fileToUpload,
        onProgress: (progress) => {
          setVersionUploadProgress((prev) => ({ ...prev, [design.id]: progress }));
        },
      });

      await setDoc(doc(db, "designVersions", versionId), {
        id: versionId,
        tenantId: user.tenantId,
        designId: design.id,
        versionNo: nextVersion,
        status: "current",
        fileName: uploaded.fileName,
        originalFileName: uploaded.originalFileName,
        fileSize: uploaded.fileSize,
        originalFileSize: uploaded.originalFileSize,
        fileType: uploaded.fileType,
        wasCompressed: uploaded.wasCompressed,
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
        latestFileType: uploaded.fileType,
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
      setVersionUploadProgress((prev) => ({ ...prev, [design.id]: 0 }));
    }
  }

  async function generateApprovalLink(design: Design) {
    if (!user) return;

    const recipientEmail = approvalEmailByDesign[design.id]?.trim();
    if (!recipientEmail) {
      alert("Enter recipient email first.");
      return;
    }

    setCreatingLinkForDesignId(design.id);

    try {
      const idToken = await auth.currentUser?.getIdToken();

      const res = await fetch("/api/approval-links/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          designId: design.id,
          recipientEmail,
          expiresInDays: 7,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Could not create approval link");
      }

      setApprovalLinkByDesign((prev) => ({
        ...prev,
        [design.id]: json.approvalUrl,
      }));
    } catch (err: any) {
      alert(err?.message || "Could not create approval link");
    } finally {
      setCreatingLinkForDesignId(null);
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
              onChange={(e) => onMainFileChange(e.target.files?.[0] || null)}
              className="w-full rounded-xl border bg-white px-4 py-3"
            />

            {localPreviewUrl && (
              <div className="overflow-hidden rounded-xl border bg-slate-50">
                <img
                  src={localPreviewUrl}
                  alt="Selected design preview"
                  className="max-h-64 w-full object-contain"
                />
              </div>
            )}

            {creating && (
              <div>
                <div className="mb-2 flex justify-between text-sm font-semibold text-slate-600">
                  <span>Uploading</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-slate-950 transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

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
                  <div className="min-w-0 flex-1">
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

                    {d.latestFileUrl && d.latestFileType?.startsWith("image/") && (
                      <div className="mt-3 overflow-hidden rounded-xl border bg-slate-50">
                        <img
                          src={d.latestFileUrl}
                          alt={d.latestFileName || d.title}
                          className="max-h-72 w-full object-contain"
                        />
                      </div>
                    )}

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

                    <div className="mt-4 rounded-xl border bg-slate-50 p-4">
                      <label className="block text-xs font-semibold text-slate-500">
                        Secure client approval link
                      </label>

                      <div className="mt-2 flex gap-2">
                        <input
                          type="email"
                          value={approvalEmailByDesign[d.id] || ""}
                          onChange={(e) =>
                            setApprovalEmailByDesign((prev) => ({
                              ...prev,
                              [d.id]: e.target.value,
                            }))
                          }
                          placeholder="client@email.com"
                          className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm"
                        />

                        <button
                          type="button"
                          onClick={() => generateApprovalLink(d)}
                          disabled={creatingLinkForDesignId === d.id}
                          className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {creatingLinkForDesignId === d.id ? "Creating..." : "Create"}
                        </button>
                      </div>

                      {approvalLinkByDesign[d.id] && (
                        <div className="mt-3 rounded-lg bg-white p-3 text-sm">
                          <p className="font-semibold text-slate-600">Approval link:</p>
                          <a
                            href={approvalLinkByDesign[d.id]}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all text-blue-700 underline"
                          >
                            {approvalLinkByDesign[d.id]}
                          </a>
                        </div>
                      )}
                    </div>

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

                    {uploadingDesignId === d.id && (
                      <div className="mt-3">
                        <div className="mb-2 flex justify-between text-sm font-semibold text-slate-600">
                          <span>Uploading new version</span>
                          <span>{versionUploadProgress[d.id] || 0}%</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full bg-slate-950 transition-all"
                            style={{ width: `${versionUploadProgress[d.id] || 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
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
