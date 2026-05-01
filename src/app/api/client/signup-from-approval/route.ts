import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { hashSecret, parsePublicToken } from "@/lib/tokenSecurity";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!idToken) {
      return NextResponse.json({ error: "Missing login token" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = String(decoded.email || "").toLowerCase();

    const body = await req.json();
    const publicToken = String(body.token || "");
    const { tokenId, secret } = parsePublicToken(publicToken);

    const linkSnap = await adminDb.collection("approvalLinks").doc(tokenId).get();

    if (!linkSnap.exists) {
      return NextResponse.json({ error: "Invalid approval link" }, { status: 404 });
    }

    const link = linkSnap.data() as any;

    if (link.tokenHash !== hashSecret(secret)) {
      return NextResponse.json({ error: "Invalid approval link" }, { status: 404 });
    }

    if (link.expiresAt?.toMillis && link.expiresAt.toMillis() < Date.now()) {
      return NextResponse.json({ error: "Approval link has expired" }, { status: 410 });
    }

    if (String(link.recipientEmail || "").toLowerCase() !== email) {
      return NextResponse.json(
        { error: "This login email does not match the approval recipient email" },
        { status: 403 }
      );
    }

    const designSnap = await adminDb.collection("designs").doc(link.designId).get();
    const design = designSnap.exists ? (designSnap.data() as any) : {};

    const now = Timestamp.now();

    await adminDb.collection("users").doc(decoded.uid).set(
      {
        uid: decoded.uid,
        tenantId: link.tenantId,
        email,
        name: decoded.name || email,
        role: "client",
        side: "client",
        status: "active",
        customerName: design.customerName || "",
        linkedApprovalLinkId: tokenId,
        linkedDesignIds: [link.designId],
        emailVerified: decoded.email_verified === true,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    await adminDb.collection("auditLogs").doc(crypto.randomUUID()).set({
      tenantId: link.tenantId,
      actorUid: decoded.uid,
      actorEmail: email,
      action: "CLIENT_ACCOUNT_LINKED_FROM_APPROVAL",
      module: "auth",
      targetType: "user",
      targetId: decoded.uid,
      message: `Client account linked from approval link for ${email}`,
      metadata: { approvalLinkId: tokenId, designId: link.designId },
      createdAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("client signup from approval error", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
