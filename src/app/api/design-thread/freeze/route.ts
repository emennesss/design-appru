import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { designId, token, actorEmail, freezeNote } = body;

    if (!designId || !token) {
      return NextResponse.json({ error: "designId and token required" }, { status: 400 });
    }

    const linkRef = adminDb.collection("approvalLinks").doc(token);
    const linkSnap = await linkRef.get();

    if (!linkSnap.exists) {
      return NextResponse.json({ error: "Invalid approval link" }, { status: 404 });
    }

    const link = linkSnap.data() as any;

    const designRef = adminDb.collection("designs").doc(designId);
    const designSnap = await designRef.get();

    if (!designSnap.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    const design = designSnap.data() as any;

    const linkVersion = Number(link.versionNo || 1);
    const currentVersion = Number(design.currentVersion || 1);
    const approvedVersion = Number(design.approvedVersion || 0);

    // 🔒 Critical version check
    if (linkVersion !== currentVersion || approvedVersion !== linkVersion) {
      return NextResponse.json(
        {
          error: `Only approved current version can be frozen. Link V${linkVersion}, current V${currentVersion}, approved V${approvedVersion}`,
        },
        { status: 409 }
      );
    }

    if (design.status !== "approved") {
      return NextResponse.json(
        { error: "Design must be approved before freeze." },
        { status: 400 }
      );
    }

    const now = Timestamp.now();

    await designRef.update({
      status: "frozen",
      approvalStage: `v${linkVersion}_client_final_frozen`,
      frozen: true,
      frozenAt: now,
      frozenByEmail: actorEmail || link.recipientEmail || "client",
      frozenVersion: linkVersion,
      frozenFileUrl: link.versionFileUrl || design.latestFileUrl || "",
      frozenFileName: link.versionFileName || design.latestFileName || "",
      freezeNote: freezeNote || "",
      updatedAt: now,
    });

    await adminDb.collection("auditLogs").doc(crypto.randomUUID()).set({
      tenantId: design.tenantId || design.designerOrgId,
      designerOrgId: design.designerOrgId || design.tenantId,
      clientOrgId: design.clientOrgId || null,
      actorEmail: actorEmail || link.recipientEmail || "client",
      actorSide: "client",
      action: "CLIENT_FINAL_FREEZE",
      targetType: "design",
      targetId: designId,
      versionNo: linkVersion,
      message: `Client froze V${linkVersion}: ${design.title || designId}`,
      createdAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("freeze error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
