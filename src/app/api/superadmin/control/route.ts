import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperadminEmail } from "@/lib/superadminGuard";
import { Timestamp } from "firebase-admin/firestore";

function cleanId(v: string) {
  return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
}

function cleanEmail(v: string) {
  return String(v || "").trim().toLowerCase();
}

export async function GET(req: Request) {
  const guard = requireSuperadminEmail(req.headers.get("x-user-email"));
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: 403 });
  }

  const [usersSnap, designersSnap, clientsSnap, linksSnap] = await Promise.all([
    adminDb.collection("users").get(),
    adminDb.collection("designerOrganizations").get(),
    adminDb.collection("clientOrganizations").get(),
    adminDb.collection("organizationLinks").get(),
  ]);

  return NextResponse.json({
    users: usersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    designerOrganizations: designersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    clientOrganizations: clientsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    organizationLinks: linksSnap.docs.map(d => ({ id: d.id, ...d.data() })),
  });
}

export async function POST(req: NextRequest) {
  const guard = requireSuperadminEmail(req.headers.get("x-user-email"));
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: 403 });
  }

  try {
    const body = await req.json();
    const action = body.action;
    const now = Timestamp.now();

    if (action === "createDesignerOrg") {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Designer organization name required" }, { status: 400 });

      const id = cleanId(body.id || name);

      await adminDb.collection("designerOrganizations").doc(id).set({
        id,
        name,
        status: "active",
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      return NextResponse.json({ success: true, id });
    }

    if (action === "createClientOrg") {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Client organization name required" }, { status: 400 });

      const id = cleanId(body.id || name);

      await adminDb.collection("clientOrganizations").doc(id).set({
        id,
        name,
        primaryEmail: cleanEmail(body.primaryEmail || ""),
        status: "active",
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      return NextResponse.json({ success: true, id });
    }

    if (action === "createUser") {
      const email = cleanEmail(body.email);
      if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

      const side = body.side === "client" ? "client" : "designer";
      const role = String(body.role || (side === "client" ? "client_approver" : "designer_staff"));
      const designerOrgId = body.designerOrgId || "default";
      const clientOrgId = body.clientOrgId || "";

      await adminDb.collection("users").doc(email).set({
        email,
        name: String(body.name || ""),
        side,
        role,
        tenantId: designerOrgId || "default",
        designerOrgId: side === "designer" ? designerOrgId : "",
        clientOrgId: side === "client" ? clientOrgId : "",
        status: "active",
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      return NextResponse.json({ success: true, email });
    }

    if (action === "linkOrganizations") {
      const designerOrgId = String(body.designerOrgId || "").trim();
      const clientOrgId = String(body.clientOrgId || "").trim();

      if (!designerOrgId || !clientOrgId) {
        return NextResponse.json({ error: "designerOrgId and clientOrgId required" }, { status: 400 });
      }

      const id = `${designerOrgId}__${clientOrgId}`;

      await adminDb.collection("organizationLinks").doc(id).set({
        id,
        designerOrgId,
        clientOrgId,
        status: "active",
        relationshipType: "design_approval",
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      return NextResponse.json({ success: true, id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("superadmin control error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
