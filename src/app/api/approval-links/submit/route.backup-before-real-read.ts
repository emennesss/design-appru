import { NextRequest, NextResponse } from "next/server";
import { adminDb, Timestamp } from "@/lib/firebaseAdmin";
import { hashSecret, parsePublicToken } from "@/lib/tokenSecurity";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const token = String(body.token || "");
    const decision = String(body.decision || "");
    const comment = String(body.comment || "").trim();
    const clientName = String(body.clientName || "").trim();

    if (!["approved", "rejected"].includes(decision)) {
      return NextResponse.json({ error: "Decision must be approved or rejected" }, { status: 400 });
    }

    const { tokenId, secret } = parsePublicToken(token);
    const linkRef = adminDb.collection("approvalLinks").doc(tokenId);
    const linkSnap = await linkRef.get();

    if (!linkSnap.exists) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }

    const link = linkSnap.data() as any;

    if (link.tokenHash !== hashSecret(secret)) {
      return NextResponse.json({ error: "Invalid link" }, { status: 403 });
    }

    if (link.status !== "active") {
      return NextResponse.json({ error: `Link is ${link.status}` }, { status: 403 });
    }

    const expiresAt = link.expiresAt?.toDate?.() || new Date(0);
    if (expiresAt.getTime() < Date.now()) {
      await linkRef.update({ status: "expired", updatedAt: Timestamp.now() });
      return NextResponse.json({ error: "Link expired" }, { status: 403 });
    }

    const now = new Date();

    await adminDb.collection("designs").doc(link.designId).update({
      status: decision,
      clientDecision: decision,
      clientComment: comment,
      clientName,
      clientEmail: link.recipientEmail,
      clientApprovedOrRejectedAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await linkRef.update({
      status: "used",
      decision,
      comment,
      clientName,
      usedAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    await adminDb.collection("auditLogs").doc(crypto.randomUUID()).set({
      tenantId: link.tenantId,
      actorUid: "external-client",
      actorEmail: link.recipientEmail,
      action: decision === "approved" ? "CLIENT_APPROVED_DESIGN" : "CLIENT_REJECTED_DESIGN",
      module: "clientApproval",
      targetType: "design",
      targetId: link.designId,
      message: `Client ${decision} design. Comment: ${comment || "No comment"}`,
      createdAt: Timestamp.fromDate(now),
    });

    return NextResponse.json({ ok: true, decision });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to submit approval" }, { status: 500 });
  }
}
