import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const designId = String(req.nextUrl.searchParams.get("designId") || "");

  if (!designId) {
    return NextResponse.json({ error: "Missing designId" }, { status: 400 });
  }

  const snap = await adminDb
    .collection("designVersions")
    .where("designId", "==", designId)
    .get();

  const versions = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => Number(b.versionNo || 0) - Number(a.versionNo || 0));

  return NextResponse.json({ versions });
}
