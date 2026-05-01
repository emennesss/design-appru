import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { hashInviteSecret, parseInviteToken } from "@/lib/inviteSecurity";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!idToken) {
      return NextResponse.json({ error: "Missing login token" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const loginEmail = String(decoded.email || "").toLowerCase();

    const body = await req.json();
    const publicToken = String(body.token || "");

    const { tokenId, secret } = parseInviteToken(publicToken);

    const inviteRef = adminDb.collection("invites").doc(tokenId);
    const now = Timestamp.now();

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(inviteRef);

      if (!snap.exists) throw new Error("Invalid invite");

      const invite = snap.data() as any;

      if (invite.tokenHash !== hashInviteSecret(secret)) {
        throw new Error("Invalid invite");
      }

      if (invite.status === "accepted") {
        throw new Error("Invite already accepted");
      }

      if (invite.expiresAt?.toMillis && invite.expiresAt.toMillis() < Date.now()) {
        throw new Error("Invite expired");
      }

      if (String(invite.email || "").toLowerCase() !== loginEmail) {
        throw new Error("This login email does not match the invited email.");
      }

      if (invite.role === "superadmin") {
        throw new Error("Superadmin invite is not allowed.");
      }

      const userRef = adminDb.collection("users").doc(decoded.uid);

      tx.set(
        userRef,
        {
          uid: decoded.uid,
          tenantId: invite.tenantId,
          email: loginEmail,
          name: decoded.name || invite.name || loginEmail,
          role: invite.role,
          side: invite.role === "client" ? "client" : "designer",
          status: "active",
          invitedByUid: invite.createdByUid,
          invitedByEmail: invite.createdByEmail,
          inviteId: tokenId,
          emailVerified: decoded.email_verified === true,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      tx.update(inviteRef, {
        status: "accepted",
        acceptedAt: now,
        acceptedByUid: decoded.uid,
        updatedAt: now,
      });

      tx.set(adminDb.collection("auditLogs").doc(), {
        tenantId: invite.tenantId,
        actorUid: decoded.uid,
        actorEmail: loginEmail,
        action: "INVITE_ACCEPTED",
        module: "invites",
        targetType: "invite",
        targetId: tokenId,
        message: `${loginEmail} accepted invite as ${invite.role}`,
        metadata: { role: invite.role },
        createdAt: now,
      });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("invite accept error", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 400 });
  }
}
