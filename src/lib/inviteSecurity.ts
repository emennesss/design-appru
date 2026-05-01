import crypto from "crypto";

export function hashInviteSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function createInviteToken() {
  const tokenId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("hex");

  return {
    tokenId,
    secret,
    tokenHash: hashInviteSecret(secret),
    publicToken: `${tokenId}.${secret}`,
  };
}

export function parseInviteToken(token: string) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid invite token");
  }

  return {
    tokenId: parts[0],
    secret: parts[1],
  };
}
