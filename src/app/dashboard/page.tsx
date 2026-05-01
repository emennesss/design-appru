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
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebaseClient";
import { APP_NAME } from "@/lib/appConfig";
import { compressImageForApproval } from "@/lib/imageCompression";
import { hasPermission, roleLabel } from "@/lib/permissions";

type UserProfile = {
  uid: string;
  email: string;
  name: string;
  tenantId: string;
  role: string;
};

type Dimensions = {
  length?: string;
  width?: string;
  height?: string;
};

type Design = {
  id: string;
  tenantId: string;
  title: string;
  customerName: string;
  status: string;
  approvalStage?: string;
  currentVersion: number;
  latestFileUrl?: string;
  latestFileName?: string;
  latestFileType?: string;
  adminDimensions?: Dimensions | null;
  clientDimensions?: Dimensions | null;
  clientNotes?: string;
};

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("designer");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

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
  const [adminDimensionsByDesign, setAdminDimensionsByDesign] = useState<Record<string, Dimensions>>({});
  const [savingDimensionsForDesignId, setSavingDimensionsForDesignId] = useState<string | null>(null);

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

      const appUser = userSnap.data() as UserProfile;

      if (!hasPermission(appUser.role, "design_view")) {
        router.push("/client/dashboard");
        return;
      }

      setUser(appUser);
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
      const nextDesigns = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Design[];

      setDesigns(nextDesigns);

      setAdminDimensionsByDesign((prev) => {
        const copy = { ...prev };
        for (const design of nextDesigns) {
          if (!copy[design.id]) {
            copy[design.id] = {
              length: design.adminDimensions?.length || "",
              width: design.adminDimensions?.width || "",
              height: design.adminDimensions?.height || "",
            };
          }
        }
        return copy;
      });
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

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();

    setInviteError("");
    setInviteUrl("");
    setInviteLoading(true);

    try {
      const idToken = await auth.currentUser?.getIdToken();

      if (!idToken) {
        throw new Error("Login expired. Please login again.");
      }

      const res = await fetch("/api/invites/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          role: inviteRole,
        }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error || "Could not create invite");

      setInviteUrl(json.inviteUrl);
    } catch (err: any) {
      setInviteError(err?.message || "Invite failed");
    } finally {
      setInviteLoading(false);
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
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
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
        approvalStage: "needs_approval",
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

      setTitle("");
      setCustomerName("");
      setFile(null);
      setLocalPreviewUrl("");
      setUploadProgress(0);
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
        approvalStage: `designer_uploaded_v${nextVersion}`,
        currentVersion: nextVersion,
        latestVersionId: versionId,
        latestFileUrl: uploaded.downloadUrl,
        latestFileName: uploaded.fileName,
        latestFileType: uploaded.fileType,
        latestStoragePath: uploaded.storagePath,
        clientDecision: null,
        updatedAt: serverTimestamp(),
      });
    } finally {
      setUploadingDesignId(null);
      setVersionUploadProgress((prev) => ({ ...prev, [design.id]: 0 }));
    }
  }

  async function saveAdminDimensions(design: Design) {
    if (!user) return;

    const dimensions = adminDimensionsByDesign[design.id] || {};
    setSavingDimensionsForDesignId(design.id);

    try {
      await updateDoc(doc(db, "designs", design.id), {
        adminDimensions: {
          length: dimensions.length || "",
          width: dimensions.width || "",
          height: dimensions.height || "",
        },
        approvalStage: "needs_approval",
        updatedAt: serverTimestamp(),
      });
    } finally {
      setSavingDimensionsForDesignId(null);
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
              Tenant: {user?.tenantId} · Role: {roleLabel(user?.role)}
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
        <div className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Invite User</h2>
            <form onSubmit={createInvite} className="mt-4 space-y-3">
              <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Name optional" className="w-full rounded-xl border px-4 py-3" />
              <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" required placeholder="Email" className="w-full rounded-xl border px-4 py-3" />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="w-full rounded-xl border px-4 py-3">
                <option value="designer">Designer</option>
                <option value="client">Approver</option>
                <option value="admin">Company Admin</option>
              </select>
              <button disabled={inviteLoading} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50">
                {inviteLoading ? "Creating..." : "Create Invite"}
              </button>
            </form>

            {inviteError && <p className="mt-3 text-sm text-red-700">{inviteError}</p>}

            {inviteUrl && (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm">
                <b>Invite link:</b>
                <div className="mt-2 break-all">{inviteUrl}</div>
                <button type="button" onClick={() => navigator.clipboard.writeText(inviteUrl)} className="mt-3 rounded-lg border bg-white px-3 py-2 text-sm font-semibold">
                  Copy Link
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Create Design Approval</h2>
            <form onSubmit={createDesign} className="mt-5 space-y-4">
              <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Design title / style name" className="w-full rounded-xl border px-4 py-3" />
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required placeholder="Customer / brand name" className="w-full rounded-xl border px-4 py-3" />
              <input id="design-file" type="file" required accept="image/*,.pdf,.ai,.psd,.cdr,.zip" onChange={(e) => onMainFileChange(e.target.files?.[0] || null)} className="w-full rounded-xl border bg-white px-4 py-3" />

              {localPreviewUrl && <img src={localPreviewUrl} alt="Preview" className="max-h-64 w-full rounded-xl border object-contain" />}

              {creating && <p className="text-sm font-semibold">Uploading {uploadProgress}%</p>}
              {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

              <button disabled={creating || !file} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50">
                {creating ? "Uploading..." : "Create Approval with File"}
              </button>
            </form>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Design Approvals</h2>

          <div className="mt-5 space-y-3">
            {designs.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center text-slate-500">No designs yet.</div>}

            {designs.map((d) => (
              <div key={d.id} className="rounded-xl border p-4">
                <h3 className="font-bold">{d.title}</h3>
                <p className="text-sm text-slate-500">Customer: {d.customerName}</p>
                <p className="text-sm text-slate-500">Version: V{d.currentVersion || 1}</p>
                <p className="text-sm text-slate-500">Status: {d.status} · Stage: {d.approvalStage || "needs_approval"}</p>

                {d.latestFileUrl && d.latestFileType?.startsWith("image/") && (
                  <img src={d.latestFileUrl} alt={d.latestFileName || d.title} className="mt-3 max-h-72 w-full rounded-xl border object-contain" />
                )}

                {d.latestFileUrl && (
                  <a href={d.latestFileUrl} target="_blank" rel="noreferrer" className="mt-3 block text-sm font-semibold text-blue-700 underline">
                    Open latest file
                  </a>
                )}

                <div className="mt-4 rounded-xl border bg-white p-4">
                  <label className="block text-xs font-semibold text-slate-500">Admin product dimensions / specs</label>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <input placeholder="Length" value={adminDimensionsByDesign[d.id]?.length || ""} onChange={(e) => setAdminDimensionsByDesign((prev) => ({ ...prev, [d.id]: { ...(prev[d.id] || {}), length: e.target.value } }))} className="rounded-lg border px-3 py-2 text-sm" />
                    <input placeholder="Width" value={adminDimensionsByDesign[d.id]?.width || ""} onChange={(e) => setAdminDimensionsByDesign((prev) => ({ ...prev, [d.id]: { ...(prev[d.id] || {}), width: e.target.value } }))} className="rounded-lg border px-3 py-2 text-sm" />
                    <input placeholder="Height" value={adminDimensionsByDesign[d.id]?.height || ""} onChange={(e) => setAdminDimensionsByDesign((prev) => ({ ...prev, [d.id]: { ...(prev[d.id] || {}), height: e.target.value } }))} className="rounded-lg border px-3 py-2 text-sm" />
                  </div>

                  <button type="button" onClick={() => saveAdminDimensions(d)} disabled={savingDimensionsForDesignId === d.id} className="mt-3 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {savingDimensionsForDesignId === d.id ? "Saving..." : "Save Dimensions"}
                  </button>

                  {d.clientDimensions && (
                    <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                      <p className="font-bold">Client submitted dimensions</p>
                      <p>L: {d.clientDimensions.length || "-"} · W: {d.clientDimensions.width || "-"} · H: {d.clientDimensions.height || "-"}</p>
                      {d.clientNotes && <p className="mt-1">Notes: {d.clientNotes}</p>}
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-xl border bg-slate-50 p-4">
                  <label className="block text-xs font-semibold text-slate-500">Secure client approval link</label>
                  <div className="mt-2 flex gap-2">
                    <input type="email" value={approvalEmailByDesign[d.id] || ""} onChange={(e) => setApprovalEmailByDesign((prev) => ({ ...prev, [d.id]: e.target.value }))} placeholder="client@email.com" className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm" />
                    <button type="button" onClick={() => generateApprovalLink(d)} disabled={creatingLinkForDesignId === d.id} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      {creatingLinkForDesignId === d.id ? "Creating..." : "Create"}
                    </button>
                  </div>

                  {approvalLinkByDesign[d.id] && (
                    <div className="mt-3 rounded-lg bg-white p-3 text-sm">
                      <p className="font-semibold text-slate-600">Approval link:</p>
                      <a href={approvalLinkByDesign[d.id]} target="_blank" rel="noreferrer" className="break-all text-blue-700 underline">
                        {approvalLinkByDesign[d.id]}
                      </a>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-semibold text-slate-500">Upload revised version</label>
                  <input type="file" accept="image/*,.pdf,.ai,.psd,.cdr,.zip" disabled={uploadingDesignId === d.id} onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) uploadNewVersion(d, selectedFile);
                    e.currentTarget.value = "";
                  }} className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
                </div>

                {uploadingDesignId === d.id && <p className="mt-3 text-sm font-semibold">Uploading new version {versionUploadProgress[d.id] || 0}%</p>}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
