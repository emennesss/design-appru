import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const linkRef = adminDb.collection("approvalLinks").doc(token);
    const linkSnap = await linkRef.get();

    if (!linkSnap.exists) {
      return NextResponse.json({ error: "Invalid approval link" }, { status: 404 });
    }

    const link = linkSnap.data() as any;

    if (!link.designId) {
      return NextResponse.json({ error: "Approval link missing designId" }, { status: 400 });
    }

    const designSnap = await adminDb.collection("designs").doc(link.designId).get();

    if (!designSnap.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    const design = designSnap.data() as any;

    return NextResponse.json({
      token,
      link: {
        id: token,
        recipientEmail: link.recipientEmail || "",
        status: link.status || design.status || "pending",
        finalized: link.finalized === true || ["approved", "rejected"].includes(link.status),
        adminDimensions: link.adminDimensions || design.adminDimensions || null,
        clientDimensions: link.clientDimensions || design.clientDimensions || null,
        clientNotes: link.clientNotes || design.clientNotes || "",
      },
      design: {
        id: designSnap.id,
        title: design.title || "",
        customerName: design.customerName || "",
        status: design.status || "pending",
        approvalStage: design.approvalStage || "",
        currentVersion: design.currentVersion || 1,
        latestFileUrl: design.latestFileUrl || "",
        latestFileName: design.latestFileName || "",
        latestFileType: design.latestFileType || "",
        adminDimensions: design.adminDimensions || link.adminDimensions || null,
        clientDimensions: design.clientDimensions || link.clientDimensions || null,
        clientNotes: design.clientNotes || link.clientNotes || "",
      },
    });
  } catch (err) {
    console.error("approval read error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
