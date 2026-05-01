export const SUPERADMIN_EMAIL = "mukundnshinde@gmail.com";

export function requireSuperadminEmail(email: string | null) {
  const clean = String(email || "").trim().toLowerCase();

  if (clean !== SUPERADMIN_EMAIL) {
    return {
      ok: false,
      error: "Unauthorized. Superadmin access only.",
    };
  }

  return {
    ok: true,
    email: clean,
  };
}
