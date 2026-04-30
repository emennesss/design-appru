import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { v4 as uuidv4 } from "uuid";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { designId, recipientEmail } = body;

    if (!designId) {
      return NextResponse.json({ error: "Missing designId" }, { status: 400 });
    }

    const designSnap = await adminDb.collection("designs").doc(designId).get();

    if (!designSnap.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    const design = designSnap.data() as any;
    const token = uuidv4();
    const now = Timestamp.now();

    await adminDb.collection("approvalLinks").doc(token).set({
      token,
      designId,
      tenantId: design.tenantId || null,
      recipientEmail: recipientEmail || null,
      status: "sent",
      finalized: false,
      tokenUsed: false,
      adminDimensions: design.adminDimensions || null,
      clientDimensions: null,
      clientNotes: null,
      createdAt: now,
      updatedAt: now,
    });

    await adminDb.collection("designs").doc(designId).update({
      approvalStage: "sent_to_client",
      status: "sent",
      latestApprovalToken: token,
      latestApprovalRecipientEmail: recipientEmail || null,
      updatedAt: now,
    });

    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "https";

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      origin ||
      (host ? `${proto}://${host}` : "http://localhost:3000");

    return NextResponse.json({
      approvalUrl: `${baseUrl}/client-approval/${token}`,
    });
  } catch (err) {
    console.error("approval create error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
