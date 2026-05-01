import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { hashSecret, parsePublicToken } from "@/lib/tokenSecurity";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const publicToken = String(body.token || "");
    const decision = String(body.decision || "");
    const dimensions = body.dimensions || {};
    const notes = String(body.notes || "");

    if (!publicToken || !["approved", "rejected"].includes(decision)) {
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

    const { tokenId, secret } = parsePublicToken(publicToken);
    const linkRef = adminDb.collection("approvalLinks").doc(tokenId);
    const now = Timestamp.now();

    await adminDb.runTransaction(async (tx) => {
      const linkSnap = await tx.get(linkRef);

      if (!linkSnap.exists) throw new Error("Invalid approval link");

      const link = linkSnap.data() as any;

      if (link.tokenHash !== hashSecret(secret)) {
        throw new Error("Invalid approval link");
      }

      if (link.expiresAt?.toMillis && link.expiresAt.toMillis() < Date.now()) {
        throw new Error("Approval link has expired");
      }

      if (link.finalized === true || ["approved", "rejected"].includes(link.status)) {
        throw new Error("This approval has already been finalized and cannot be changed.");
      }

      const designRef = adminDb.collection("designs").doc(link.designId);
      const designSnap = await tx.get(designRef);

      if (!designSnap.exists) throw new Error("Design not found");

      const design = designSnap.data() as any;

      if (design.tenantId !== link.tenantId) {
        throw new Error("Approval link mismatch");
      }

      tx.update(linkRef, {
        status: decision,
        finalized: true,
        tokenUsed: true,
        clientDecision: decision,
        clientDimensions: dimensions,
        clientNotes: notes,
        clientSubmittedAt: now,
        updatedAt: now,
      });

      tx.update(designRef, {
        status: decision,
        approvalStage: decision === "approved" ? "client_approved" : "client_rejected",
        clientDecision: decision,
        clientDimensions: dimensions,
        clientNotes: notes,
        clientApprovedOrRejectedAt: now,
        updatedAt: now,
      });

      const auditRef = adminDb.collection("auditLogs").doc(crypto.randomUUID());
      tx.set(auditRef, {
        tenantId: design.tenantId,
        actorUid: "client-link",
        actorEmail: link.recipientEmail || "client",
        action: decision === "approved" ? "CLIENT_DESIGN_APPROVED" : "CLIENT_DESIGN_REJECTED",
        module: "designs",
        targetType: "design",
        targetId: link.designId,
        message: `Client ${decision} design: ${design.title || link.designId}`,
        metadata: {
          approvalLinkId: tokenId,
          dimensions,
          notes,
        },
        createdAt: now,
      });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("approval submit error", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 400 });
  }
}
