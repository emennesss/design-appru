import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const email = String(req.nextUrl.searchParams.get("email") || "").toLowerCase();

  if (!email) {
    return NextResponse.json({ designs: [] });
  }

  const snap = await adminDb
    .collection("designs")
    .where("latestApprovalRecipientEmail", "==", email)
    .get();

  const designs = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  return NextResponse.json({ designs });
}
