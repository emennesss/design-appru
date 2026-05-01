import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const designId = req.nextUrl.searchParams.get("designId");

  const snap = await adminDb
    .collection("designNotes")
    .where("designId", "==", designId)
    .get();

  const notes = snap.docs.map(d => d.data());

  return NextResponse.json({ notes });
}
