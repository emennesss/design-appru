import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { v4 as uuidv4 } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { normalizeEmail, safeId } from "@/lib/userRoles";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { designId, recipientEmail } = body;

    if (!designId) {
      return NextResponse.json({ error: "Missing designId" }, { status: 400 });
    }

    const cleanEmail = normalizeEmail(recipientEmail || "");
    if (!cleanEmail) {
      return NextResponse.json({ error: "Recipient email required" }, { status: 400 });
    }

    const designRef = adminDb.collection("designs").doc(designId);
    const designSnap = await designRef.get();

    if (!designSnap.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    const design = designSnap.data() as any;
    const now = Timestamp.now();

    const designerOrgId = design.designerOrgId || design.tenantId || "default";
    const clientOrgId = design.clientOrgId || `client_${safeId(cleanEmail)}`;
    const organizationLinkId = `${designerOrgId}__${clientOrgId}`;
    const token = uuidv4();

    await adminDb.collection("designerOrganizations").doc(designerOrgId).set({
      id: designerOrgId,
      tenantId: designerOrgId,
      name: design.designerOrgName || design.tenantName || "Designer Organization",
      status: "active",
      updatedAt: now,
      createdAt: design.createdAt || now,
    }, { merge: true });

    await adminDb.collection("clientOrganizations").doc(clientOrgId).set({
      id: clientOrgId,
      primaryEmail: cleanEmail,
      name: design.customerName || cleanEmail,
      status: "active",
      updatedAt: now,
      createdAt: now,
    }, { merge: true });

    await adminDb.collection("organizationLinks").doc(organizationLinkId).set({
      id: organizationLinkId,
      designerOrgId,
      clientOrgId,
      status: "active",
      relationshipType: "design_approval",
      createdFromDesignId: designId,
      updatedAt: now,
      createdAt: now,
    }, { merge: true });

    await adminDb.collection("approvalLinks").doc(token).set({
      token,
      designId,
      designerOrgId,
      clientOrgId,
      organizationLinkId,
      tenantId: design.tenantId || designerOrgId,
      recipientEmail: cleanEmail,
      status: "sent",
      versionNo: design.currentVersion || 1,
      versionFileUrl: design.latestFileUrl || "",
      versionFileName: design.latestFileName || "",
      finalized: false,
      tokenUsed: false,
      adminDimensions: design.adminDimensions || null,
      clientDimensions: null,
      clientNotes: null,
      createdAt: now,
      updatedAt: now,
    });

    await designRef.update({
      designerOrgId,
      clientOrgId,
      organizationLinkId,
      approvalStage: `v${design.currentVersion || 1}_sent_to_client`,
      status: "sent",
      approvalVersion: design.currentVersion || 1,
      latestApprovalToken: token,
      latestApprovalRecipientEmail: cleanEmail,
      assignedApproverEmails: Array.from(new Set([...(design.assignedApproverEmails || []), cleanEmail])),
      updatedAt: now,
    });

    await adminDb.collection("auditLogs").doc(crypto.randomUUID()).set({
      tenantId: design.tenantId || designerOrgId,
      designerOrgId,
      clientOrgId,
      organizationLinkId,
      actorUid: "server",
      actorEmail: "system",
      action: "APPROVAL_LINK_CREATED",
      module: "approvalLinks",
      targetType: "design",
      targetId: designId,
      message: `Approval link created for ${cleanEmail}`,
      createdAt: now,
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
      organizationLinkId,
      designerOrgId,
      clientOrgId,
    });
  } catch (err) {
    console.error("approval create error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
