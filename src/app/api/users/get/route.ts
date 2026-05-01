import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const email = String(req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const direct = await adminDb.collection("users").doc(email).get();

  if (direct.exists) {
    return NextResponse.json({ user: { id: direct.id, ...direct.data() } });
  }

  const qs = await adminDb.collection("users").where("email", "==", email).limit(1).get();

  if (!qs.empty) {
    const doc = qs.docs[0];
    return NextResponse.json({ user: { id: doc.id, ...doc.data() } });
  }

  return NextResponse.json({ user: null });
}
