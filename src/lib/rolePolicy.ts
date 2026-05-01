export const PLATFORM_SUPERADMIN_EMAIL = "mukundnshinde@gmail.com";

export const COMPANY_EDITABLE_ROLES = ["admin", "designer", "client"] as const;

export function canBeSuperadmin(email: string) {
  return String(email || "").toLowerCase() === PLATFORM_SUPERADMIN_EMAIL;
}

export function sanitizeEditableRole(email: string, role: string) {
  const cleanEmail = String(email || "").toLowerCase();
  const cleanRole = String(role || "").toLowerCase();

  if (cleanRole === "superadmin") {
    if (canBeSuperadmin(cleanEmail)) return "superadmin";
    return "admin";
  }

  if (["admin", "designer", "client"].includes(cleanRole)) {
    return cleanRole;
  }

  return "client";
}
