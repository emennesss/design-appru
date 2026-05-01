import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const token = body.token;
    const decision = body.decision;
    const dimensions = body.dimensions || {};
    const notes = body.notes || "";

    if (!token || !["approved", "rejected"].includes(decision)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const linkRef = adminDb.collection("approvalLinks").doc(token);
    const linkSnap = await linkRef.get();

    if (!linkSnap.exists) {
      return NextResponse.json({ error: "Invalid approval link" }, { status: 404 });
    }

    const link = linkSnap.data() as any;

    const designRef = adminDb.collection("designs").doc(link.designId);
    const designSnap = await designRef.get();

    if (!designSnap.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    const design = designSnap.data() as any;

    const linkVersion = Number(link.versionNo || 1);
    const currentVersion = Number(design.currentVersion || 1);

    if (linkVersion !== currentVersion) {
      return NextResponse.json(
        {
          error: `This link is for V${linkVersion}, but current design is V${currentVersion}`,
        },
        { status: 409 }
      );
    }

    const now = Timestamp.now();

    const designStatus =
      decision === "approved" ? "approved" : "revision_requested";

    const approvalStage =
      decision === "approved"
        ? `v${linkVersion}_client_approved`
        : `v${linkVersion}_revision_requested`;

    // update approval link
    await linkRef.update({
      status: decision,
      finalized: true,
      clientDecision: decision,
      clientDimensions: dimensions,
      clientNotes: notes,
      clientSubmittedAt: now,
      updatedAt: now,
    });

    // update design
    await designRef.update({
      status: designStatus,
      approvalStage,
      clientDecision: decision,
      clientDimensions: dimensions,
      clientNotes: notes,
      approvedVersion: decision === "approved" ? linkVersion : null,
      updatedAt: now,
    });

    // update version record
    const versionSnap = await adminDb
      .collection("designVersions")
      .where("designId", "==", link.designId)
      .where("versionNo", "==", linkVersion)
      .limit(1)
      .get();

    if (!versionSnap.empty) {
      await versionSnap.docs[0].ref.update({
        status: designStatus,
        clientDecision: decision,
        clientDimensions: dimensions,
        clientNotes: notes,
        reviewedAt: now,
        updatedAt: now,
      });
    }

    // 🔥 ALWAYS push to thread (this fixes your missing replies issue)
    await adminDb.collection("designNotes").doc(crypto.randomUUID()).set({
      designId: link.designId,
      note:
        notes ||
        (decision === "approved"
          ? "Approved this version"
          : "Requested revision"),
      actorSide: "client",
      actorEmail: link.recipientEmail || "client",
      actionType:
        decision === "approved" ? "approved" : "revision_requested",
      versionNo: linkVersion,
      visibility: "both",
      createdAt: now,
    });

    // audit log
    await adminDb.collection("auditLogs").doc(crypto.randomUUID()).set({
      tenantId: design.tenantId || design.designerOrgId,
      designerOrgId: design.designerOrgId || design.tenantId,
      clientOrgId: design.clientOrgId || null,
      actorEmail: link.recipientEmail || "client",
      actorSide: "client",
      action:
        decision === "approved"
          ? "CLIENT_APPROVED_VERSION"
          : "CLIENT_REQUESTED_REVISION",
      targetType: "design",
      targetId: link.designId,
      versionNo: linkVersion,
      message:
        decision === "approved"
          ? `Client approved V${linkVersion}`
          : `Client requested revision for V${linkVersion}`,
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      status: designStatus,
      versionNo: linkVersion,
    });
  } catch (err) {
    console.error("approval submit error", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
