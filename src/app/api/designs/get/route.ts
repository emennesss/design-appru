import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const designId = req.nextUrl.searchParams.get("designId");

  const snap = await adminDb.collection("designs").doc(designId!).get();

  return NextResponse.json({
    design: snap.data(),
  });
}
