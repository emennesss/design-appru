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

    if (decision === "approved") {
      if (!dimensions.length || !dimensions.width || !dimensions.height) {
        return NextResponse.json(
          { error: "Length, width and height are required before approval." },
          { status: 400 }
        );
      }
    }

    const linkRef = adminDb.collection("approvalLinks").doc(token);
    const linkSnap = await linkRef.get();

    if (!linkSnap.exists) {
      return NextResponse.json({ error: "Invalid approval link" }, { status: 404 });
    }

    const link = linkSnap.data() as any;

    if (link.finalized === true || ["approved", "rejected"].includes(link.status)) {
      return NextResponse.json(
        { error: "This approval has already been finalized and cannot be changed." },
        { status: 409 }
      );
    }

    const designRef = adminDb.collection("designs").doc(link.designId);
    const designSnap = await designRef.get();

    if (!designSnap.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    const design = designSnap.data() as any;
    const now = Timestamp.now();

    await linkRef.update({
      status: decision,
      finalized: true,
      tokenUsed: true,
      clientDecision: decision,
      clientDimensions: dimensions,
      clientNotes: notes,
      clientSubmittedAt: now,
      updatedAt: now,
    });

    await designRef.update({
      status: decision,
      clientDecision: decision,
      clientDimensions: dimensions,
      clientNotes: notes,
      clientApprovedOrRejectedAt: now,
      updatedAt: now,
    });

    await adminDb.collection("auditLogs").doc(crypto.randomUUID()).set({
      tenantId: design.tenantId || link.tenantId || "unknown",
      actorUid: "client-link",
      actorEmail: link.recipientEmail || "client",
      action: decision === "approved" ? "CLIENT_DESIGN_APPROVED" : "CLIENT_DESIGN_REJECTED",
      module: "designs",
      targetType: "design",
      targetId: link.designId,
      message: `Client ${decision} design: ${design.title || link.designId}`,
      metadata: {
        token,
        dimensions,
        notes,
      },
      createdAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("approval submit error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
