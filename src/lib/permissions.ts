export type AppRole = "superadmin" | "admin" | "designer" | "client";

export type Permission =
  | "platform_manage"
  | "company_manage"
  | "users_manage"
  | "design_view"
  | "design_create"
  | "design_edit"
  | "design_upload_version"
  | "approval_send"
  | "approval_view"
  | "approval_decide";

export const ROLE_LABELS: Record<AppRole, string> = {
  superadmin: "Platform Superadmin",
  admin: "Company Admin",
  designer: "Designer",
  client: "Approver",
};

export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  superadmin: [
    "platform_manage",
    "company_manage",
    "users_manage",
    "design_view",
    "design_create",
    "design_edit",
    "design_upload_version",
    "approval_send",
    "approval_view",
    "approval_decide",
  ],
  admin: [
    "company_manage",
    "users_manage",
    "design_view",
    "design_create",
    "design_edit",
    "design_upload_version",
    "approval_send",
    "approval_view",
  ],
  designer: [
    "design_view",
    "design_create",
    "design_edit",
    "design_upload_version",
    "approval_send",
    "approval_view",
  ],
  client: [
    "approval_view",
    "approval_decide",
  ],
};

export function normalizeRole(role: unknown): AppRole {
  const r = String(role || "").toLowerCase();

  if (r === "superadmin") return "superadmin";
  if (r === "admin") return "admin";
  if (r === "designer" || r === "designer_staff") return "designer";
  if (r === "client" || r === "approver" || r === "client_approver") return "client";

  return "client";
}

export function hasPermission(role: unknown, permission: Permission) {
  const normalized = normalizeRole(role);
  return ROLE_PERMISSIONS[normalized].includes(permission);
}

export function roleLabel(role: unknown) {
  return ROLE_LABELS[normalizeRole(role)];
}

export function homePathForRole(role: unknown) {
  const normalized = normalizeRole(role);

  if (normalized === "superadmin") return "/superadmin";
  if (normalized === "client") return "/client/dashboard";
  return "/dashboard";
}
