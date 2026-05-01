import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const token = String(req.nextUrl.searchParams.get("token") || "");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const linkSnap = await adminDb.collection("approvalLinks").doc(token).get();

  if (!linkSnap.exists) {
    return NextResponse.json({ error: "Approval link not found" }, { status: 404 });
  }

  const approvalLink = { id: linkSnap.id, ...linkSnap.data() } as any;

  const designSnap = await adminDb.collection("designs").doc(approvalLink.designId).get();

  return NextResponse.json({
    approvalLink,
    design: designSnap.exists ? { id: designSnap.id, ...designSnap.data() } : null,
  });
}
