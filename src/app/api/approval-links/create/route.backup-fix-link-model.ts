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

    const token = uuidv4();

    const doc = {
      token,
      designId,
      recipientEmail: recipientEmail || null,

      status: "pending",
      finalized: false,
      tokenUsed: false,

      // NEW: admin side dimensions
      adminDimensions: null,

      // client side
      clientDimensions: null,
      clientNotes: null,

      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await adminDb.collection("approvalLinks").doc(token).set(doc);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    return NextResponse.json({
      approvalUrl: `${baseUrl}/client-approval/${token}`,
    });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
