import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperadminEmail } from "@/lib/superadminGuard";

export async function GET(req: Request) {
  const guard = requireSuperadminEmail(req.headers.get("x-user-email"));
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: 403 });
  }

  const [
    designers,
    clients,
    designs,
    links,
    pending,
    frozen
  ] = await Promise.all([
    adminDb.collection("designerOrganizations").get(),
    adminDb.collection("clientOrganizations").get(),
    adminDb.collection("designs").get(),
    adminDb.collection("organizationLinks").get(),
    adminDb.collection("designs").where("status", "==", "sent").get(),
    adminDb.collection("designs").where("status", "==", "frozen").get(),
  ]);

  return NextResponse.json({
    designers: designers.size,
    clients: clients.size,
    designs: designs.size,
    links: links.size,
    pending: pending.size,
    frozen: frozen.size,
  });
}
