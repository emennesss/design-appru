import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { createInviteToken } from "@/lib/inviteSecurity";
import { hasPermission, normalizeRole } from "@/lib/permissions";
import { Timestamp } from "firebase-admin/firestore";

async function getActor(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) throw new Error("Missing auth token");

  const decoded = await adminAuth.verifyIdToken(token);
  const snap = await adminDb.collection("users").doc(decoded.uid).get();

  if (!snap.exists) throw new Error("User profile not found");

  const user = snap.data() as any;

  if (user.status !== "active") throw new Error("Inactive user");

  return {
    uid: decoded.uid,
    email: decoded.email || user.email || "",
    role: user.role,
    tenantId: user.tenantId,
  };
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActor(req);

    if (!hasPermission(actor.role, "users_manage")) {
      return NextResponse.json({ error: "Not allowed to invite users" }, { status: 403 });
    }

    const body = await req.json();

    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const requestedRole = normalizeRole(body.role || "designer");

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    if (!["admin", "designer", "client"].includes(requestedRole)) {
      return NextResponse.json({ error: "Invalid invite role" }, { status: 400 });
    }

    if (requestedRole === "superadmin") {
      return NextResponse.json({ error: "Cannot invite superadmin" }, { status: 403 });
    }

    const { tokenId, tokenHash, publicToken } = createInviteToken();

    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(Date.now() + 1000 * 60 * 60 * 24 * 14);

    await adminDb.collection("invites").doc(tokenId).set({
      tokenId,
      tokenHash,
      tenantId: actor.tenantId,
      email,
      name,
      role: requestedRole,
      status: "pending",
      createdByUid: actor.uid,
      createdByEmail: actor.email,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      acceptedAt: null,
      acceptedByUid: null,
    });

    await adminDb.collection("auditLogs").doc().set({
      tenantId: actor.tenantId,
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "INVITE_CREATED",
      module: "invites",
      targetType: "invite",
      targetId: tokenId,
      message: `Invite created for ${email} as ${requestedRole}`,
      metadata: { email, role: requestedRole },
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
      inviteUrl: `${baseUrl}/invite/${publicToken}`,
      expiresAt: expiresAt.toDate().toISOString(),
    });
  } catch (err: any) {
    console.error("invite create error", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
