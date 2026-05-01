"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebaseClient";
import TopBar from "@/components/TopBar";
import PreviewModal from "@/components/PreviewModal";

export default function NewDesignPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser?.email) {
        router.push("/login");
        return;
      }

      const email = firebaseUser.email.toLowerCase();
      const res = await fetch(`/api/users/get?email=${encodeURIComponent(email)}`).then(r => r.json());

      if (!res.user) {
        router.push("/login");
        return;
      }

      if (res.user.role === "superadmin") {
        router.push("/superadmin");
        return;
      }

      setUser(res.user);
    });

    return () => unsub();
  }, [router]);

  function chooseFile(f: File | null) {
    setFile(f);

    if (!f) {
      setLocalPreview("");
      return;
    }

    if (f.type.startsWith("image/") || f.type === "application/pdf") {
      setLocalPreview(URL.createObjectURL(f));
    } else {
      setLocalPreview("");
    }
  }

  async function createDesign() {
    if (!user) return alert("User not loaded yet.");
    if (!title.trim()) return alert("Design title required.");
    if (!customerName.trim()) return alert("Customer / client name required.");
    if (!file) return alert("Please choose a design file.");

    setSaving(true);

    try {
      const designerOrgId = user.designerOrgId || user.tenantId || "default";
      const fileName = `${Date.now()}-${file.name}`;
      const path = `designs/${designerOrgId}/${fileName}`;

      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const docRef = await addDoc(collection(db, "designs"), {
        title,
        customerName,
        latestApprovalRecipientEmail: approverEmail.toLowerCase(),
        assignedApproverEmails: approverEmail ? [approverEmail.toLowerCase()] : [],
        tenantId: user.tenantId || designerOrgId,
        designerOrgId,
        clientOrgId: null,
        organizationLinkId: null,
        status: "uploaded",
        approvalStage: "designer_uploaded_v1",
        currentVersion: 1,
        latestFileUrl: url,
        latestFileName: file.name,
        createdByEmail: user.email,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "designVersions"), {
        designId: docRef.id,
        tenantId: user.tenantId || designerOrgId,
        designerOrgId,
        clientOrgId: null,
        organizationLinkId: null,
        versionNo: 1,
        fileUrl: url,
        fileName: file.name,
        uploadedByEmail: user.email,
        note: "Initial upload V1",
        status: "uploaded",
        createdAt: serverTimestamp(),
      });

      router.push(`/design-thread/${docRef.id}`);
    } catch (err) {
      console.error(err);
      alert("Design creation failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <TopBar />

      {previewUrl && <PreviewModal url={previewUrl} onClose={() => setPreviewUrl("")} />}

      <main style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
        <a href="/dashboard">← Back to Dashboard</a>
        <h1>Create New Design</h1>

        <input placeholder="Design title / style name" value={title} onChange={e => setTitle(e.target.value)} style={input} />
        <input placeholder="Customer / client name" value={customerName} onChange={e => setCustomerName(e.target.value)} style={input} />
        <input placeholder="Approver email" value={approverEmail} onChange={e => setApproverEmail(e.target.value)} style={input} />
        <input type="file" onChange={e => chooseFile(e.target.files?.[0] || null)} style={input} />

        {localPreview && (
          <button type="button" onClick={() => setPreviewUrl(localPreview)} style={secondaryButton}>
            Preview Selected File
          </button>
        )}

        <button onClick={createDesign} disabled={saving} style={button}>
          {saving ? "Creating..." : "Create Design"}
        </button>
      </main>
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  marginBottom: 12,
  border: "1px solid #bbb",
  borderRadius: 8,
};

const button: React.CSSProperties = {
  width: "100%",
  padding: 12,
  border: 0,
  borderRadius: 8,
  background: "#111827",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  width: "100%",
  padding: 12,
  border: "1px solid #111827",
  borderRadius: 8,
  background: "white",
  color: "#111827",
  fontWeight: 700,
  cursor: "pointer",
  marginBottom: 12,
};
