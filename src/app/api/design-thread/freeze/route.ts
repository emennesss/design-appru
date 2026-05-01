import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { hasPermission } from "@/lib/permissions";
import { Timestamp } from "firebase-admin/firestore";

async function getActor(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) throw new Error("Missing auth token");

  const decoded = await adminAuth.verifyIdToken(token);
  const snap = await adminDb.collection("users").doc(decoded.uid).get();

  if (!snap.exists) throw new Error("User not found");

  const user = snap.data() as any;

  if (user.status !== "active") throw new Error("Inactive user");

  return {
    uid: decoded.uid,
    email: decoded.email,
    role: user.role,
    tenantId: user.tenantId,
  };
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActor(req);

    if (!hasPermission(actor.role, "approval_send")) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const body = await req.json();
    const designId = String(body.designId || "");

    if (!designId) {
      return NextResponse.json({ error: "Missing designId" }, { status: 400 });
    }

    const designRef = adminDb.collection("designs").doc(designId);
    const designSnap = await designRef.get();

    if (!designSnap.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    const design = designSnap.data() as any;

    // Tenant protection
    if (design.tenantId !== actor.tenantId) {
      return NextResponse.json({ error: "Cross-tenant access denied" }, { status: 403 });
    }

    // Only allow freeze after client approval
    if (design.clientDecision !== "approved") {
      return NextResponse.json(
        { error: "Cannot freeze. Client has not approved." },
        { status: 400 }
      );
    }

    const now = Timestamp.now();

    await designRef.update({
      approvalStage: "final_frozen",
      frozenAt: now,
      frozenBy: actor.uid,
      frozenByEmail: actor.email,
      updatedAt: now,
    });

    await adminDb.collection("auditLogs").doc().set({
      tenantId: actor.tenantId,
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "DESIGN_FROZEN",
      module: "designs",
      targetType: "design",
      targetId: designId,
      message: "Design frozen after client approval",
      createdAt: now,
    });

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("freeze error", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
