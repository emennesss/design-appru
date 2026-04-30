import crypto from "crypto";

export function createApprovalToken() {
  const tokenId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashSecret(secret);

  return {
    tokenId,
    secret,
    tokenHash,
    publicToken: `${tokenId}.${secret}`,
  };
}

export function hashSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function parsePublicToken(token: string) {
  const [tokenId, secret] = token.split(".");
  if (!tokenId || !secret) {
    throw new Error("Invalid approval token");
  }

  return { tokenId, secret };
}
