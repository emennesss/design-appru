import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { hashSecret, parsePublicToken } from "@/lib/tokenSecurity";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";
    const { tokenId, secret } = parsePublicToken(token);

    const linkSnap = await adminDb.collection("approvalLinks").doc(tokenId).get();

    if (!linkSnap.exists) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }

    const link = linkSnap.data() as any;

    if (link.tokenHash !== hashSecret(secret)) {
      return NextResponse.json({ error: "Invalid link" }, { status: 403 });
    }

    if (link.status !== "active") {
      return NextResponse.json({ error: `Link is ${link.status}` }, { status: 403 });
    }

    const expiresAt = link.expiresAt?.toDate?.() || new Date(0);
    if (expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Link expired" }, { status: 403 });
    }

    const designSnap = await adminDb.collection("designs").doc(link.designId).get();

    if (!designSnap.exists) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    const design = designSnap.data() as any;

    return NextResponse.json({
      recipientEmail: link.recipientEmail,
      expiresAt: expiresAt.toISOString(),
      design: {
        id: design.id,
        title: design.title,
        customerName: design.customerName,
        status: design.status,
        currentVersion: design.currentVersion,
        latestFileUrl: design.latestFileUrl,
        latestFileName: design.latestFileName,
        latestFileType: design.latestFileType,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to read approval link" }, { status: 500 });
  }
}
