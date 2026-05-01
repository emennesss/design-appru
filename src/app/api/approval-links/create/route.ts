import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { createApprovalToken } from "@/lib/tokenSecurity";
import { Timestamp } from "firebase-admin/firestore";
import { hasPermission } from "@/lib/permissions";

async function getActor(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) throw new Error("Missing login token");

  const decoded = await adminAuth.verifyIdToken(token);
  const userSnap = await adminDb.collection("users").doc(decoded.uid).get();

  if (!userSnap.exists) throw new Error("User profile not found");

  const user = userSnap.data() as any;

  if (user.status !== "active") throw new Error("User is not active");

  return {
    uid: decoded.uid,
    email: decoded.email || user.email || "",
    tenantId: user.tenantId,
    role: user.role,
  };
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActor(req);
    const body = await req.json();

    const designId = String(body.designId || "").trim();
    const recipientEmail = String(body.recipientEmail || "").trim().toLowerCase();

    if (!designId) {
      return NextResponse.json({ error: "Missing designId" }, { status: 400 });
    }

    if (!recipientEmail || !recipientEmail.includes("@")) {
      return NextResponse.json({ error: "Valid recipient email is required" }, { status: 400 });
    }

    if (!hasPermission(actor.role, "approval_send")) {
      return NextResponse.json({ error: "Not allowed to create approval links" }, { status: 403 });
    }

    const designRef = adminDb.collection("designs").doc(designId);
    const designSnap = await designRef.get();

    if (!designSnap.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    const design = designSnap.data() as any;

    if (!design.tenantId || design.tenantId !== actor.tenantId) {
      return NextResponse.json({ error: "Design does not belong to your company" }, { status: 403 });
    }

    const { tokenId, tokenHash, publicToken } = createApprovalToken();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(Date.now() + 1000 * 60 * 60 * 24 * 14);

    await adminDb.collection("approvalLinks").doc(tokenId).set({
      tokenId,
      tokenHash,
      designId,
      tenantId: design.tenantId,
      recipientEmail,
      status: "sent",
      finalized: false,
      tokenUsed: false,
      expiresAt,
      adminDimensions: design.adminDimensions || null,
      clientDimensions: null,
      clientNotes: null,
      createdByUid: actor.uid,
      createdByEmail: actor.email,
      createdAt: now,
      updatedAt: now,
    });

    await designRef.update({
      approvalStage: "sent_to_client",
      status: "sent",
      latestApprovalToken: publicToken,
      latestApprovalRecipientEmail: recipientEmail,
      updatedAt: now,
    });

    await adminDb.collection("auditLogs").doc(crypto.randomUUID()).set({
      tenantId: design.tenantId,
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "APPROVAL_LINK_CREATED",
      module: "approval-links",
      targetType: "design",
      targetId: designId,
      message: `Approval link created for ${recipientEmail}`,
      metadata: { designId, recipientEmail },
      createdAt: now,
    });

    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "https";

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      origin ||
      (host ? `${proto}://${host}` : "http://localhost:3000");

    return NextResponse.json({
      approvalUrl: `${baseUrl}/client-approval/${publicToken}`,
      expiresAt: expiresAt.toDate().toISOString(),
    });
  } catch (err: any) {
    console.error("approval create error", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
