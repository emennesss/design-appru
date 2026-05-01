import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { hashInviteSecret, parseInviteToken } from "@/lib/inviteSecurity";
import { roleLabel } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const publicToken = req.nextUrl.searchParams.get("token") || "";
    const { tokenId, secret } = parseInviteToken(publicToken);

    const snap = await adminDb.collection("invites").doc(tokenId).get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
    }

    const invite = snap.data() as any;

    if (invite.tokenHash !== hashInviteSecret(secret)) {
      return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
    }

    if (invite.status === "accepted") {
      return NextResponse.json({ error: "Invite already accepted" }, { status: 409 });
    }

    if (invite.expiresAt?.toMillis && invite.expiresAt.toMillis() < Date.now()) {
      return NextResponse.json({ error: "Invite expired" }, { status: 410 });
    }

    return NextResponse.json({
      invite: {
        email: invite.email,
        name: invite.name || "",
        role: invite.role,
        roleLabel: roleLabel(invite.role),
        tenantId: invite.tenantId,
        expiresAt: invite.expiresAt?.toDate ? invite.expiresAt.toDate().toISOString() : null,
      },
    });
  } catch (err: any) {
    console.error("invite read error", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 400 });
  }
}
