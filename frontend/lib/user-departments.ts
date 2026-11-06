export const USER_ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador", MANAGER: "Gestor", NORMAL: "Usuário",
  TECHNICIAN: "Técnico de campo", SALES: "Comercial",
  ENGINEER_APPLICATION: "Engenharia de aplicação", LOGISTICS: "Operação e logística",
  FINANCE: "Financeiro", SUPPLIES: "Suprimentos", HR: "Recursos Humanos",
  AUDITOR: "Auditoria", CLIENT: "Cliente do portal",
};
export const ROLE_DEPARTMENTS: Record<string, string> = {
  ADMIN: "Administração", MANAGER: "Gestão", NORMAL: "Geral",
  TECHNICIAN: "Campo técnico", SALES: "Comercial",
  ENGINEER_APPLICATION: "Engenharia", LOGISTICS: "Operação",
  FINANCE: "Financeiro", SUPPLIES: "Suprimentos", HR: "Recursos Humanos",
  AUDITOR: "Auditoria", CLIENT: "Portal do cliente",
};
export function userRoleLabel(role: string) { return USER_ROLE_LABELS[role] || "Perfil personalizado"; }
