export type UserSide = "designer" | "client";

export type AppRole =
  | "designer_owner"
  | "designer_admin"
  | "designer_staff"
  | "client_owner"
  | "client_approver"
  | "client_viewer";

export function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function safeId(value: string) {
  return normalizeEmail(value).replace(/[^a-z0-9]/g, "_");
}

export function getUserSide(user: any): UserSide {
  const side = user?.side;
  const role = String(user?.role || "");

  if (side === "designer" || side === "client") return side;
  if (role.startsWith("client_")) return "client";

  return "designer";
}

export function defaultRoleForSide(side: UserSide): AppRole {
  return side === "client" ? "client_approver" : "designer_owner";
}

export function landingPathForUser(user: any) {
  return getUserSide(user) === "client" ? "/client/dashboard" : "/dashboard";
}
