"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dispatch,
  FormEvent,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AccessPolicy,
  defaultAccessByRole,
  getAccessFromToken,
} from "@/lib/access";
import { apiFetch } from "@/lib/api";
import { clearAuthSession } from "@/lib/auth-session";
import {
  DataPill,
  EmptyState,
  FieldBox,
  FormField,
  InlineMessage,
  PageHero,
  SectionCard,
  SelectInput,
  StatusBanner,
  TextInput,
} from "../components/DashboardPageKit";

type UserRole =
  | "ADMIN"
  | "MANAGER"
  | "NORMAL"
  | "TECHNICIAN"
  | "SALES"
  | "ENGINEER_APPLICATION"
  | "LOGISTICS"
  | "FINANCE"
  | "SUPPLIES"
  | "HR"
  | "AUDITOR"
  | "CLIENT";
type SkillLevel = "TRAINEE" | "JUNIOR" | "PLENO" | "SENIOR" | "MASTER";
type UserAvailabilityStatus =
  | "AVAILABLE"
  | "ON_SERVICE"
  | "IN_TRANSIT"
  | "OFF_DUTY"
  | "VACATION";
type AuditDomain =
  | "USERS"
  | "MAINTENANCE_ORDERS"
  | "PROPOSALS"
  | "CONTRACTS"
  | "INVENTORY"
  | "PURCHASE_ORDERS"
  | "FINANCE"
  | "PEOPLE";
type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  isSystemMaster?: boolean;
  department?: string | null;
  branch?: string | null;
  approvalDiscountLimit?: number | null;
  hourCost?: number | null;
  functionalId?: string | null;
  documentId?: string | null;
  managerId?: string | null;
  availabilityStatus?: UserAvailabilityStatus;
  skillLevel?: SkillLevel;
  regionTags?: string[];
  mfaEnabled?: boolean;
  salesTargetMonthly?: number | null;
  createdAt?: string;
  linkedClientId?: string | null;
  linkedClient?: {
    id: string;
    companyName: string;
    tradeName?: string | null;
  } | null;
  manager?: { id: string; name: string; role: UserRole } | null;
  accessPolicy?: AccessPolicy;
};

type ClientOption = {
  id: string;
  companyName: string;
  tradeName?: string | null;
  city?: string | null;
  state?: string | null;
};

type PresenceRow = {
  id: string;
  name: string;
  role: UserRole;
  availabilityStatus: UserAvailabilityStatus;
  latestPresence?: {
    latitude: number;
    longitude: number;
    recordedAt: string;
  } | null;
};

type PendingApprovalRow = {
  id: string;
  type: "BUDGET_DISCOUNT" | "RVT_SIGNOFF";
  entityType: string;
  entityId: string;
  createdAt: string;
  requesterUser?: { name: string } | null;
};

type AuditRow = {
  id: string;
  domain: AuditDomain;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actorUser?: { name: string } | null;
};

type ExpiringCertRow = {
  id: string;
  code: string;
  validUntil: string;
  user?: { id: string; name: string } | null;
};

type NewUserForm = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  linkedClientId: string;
  department: string;
  branch: string;
  approvalDiscountLimit: string;
  hourCost: string;
};

type PermissionItem<TKey extends string> = {
  key: TKey;
  label: string;
};

type PermissionSectionSetter = <Section extends keyof AccessPolicy>(
  section: Section,
  key: keyof AccessPolicy[Section],
  value: boolean,
) => void;

const EMPTY_NEW_USER: NewUserForm = {
  name: "",
  email: "",
  password: "",
  role: "NORMAL",
  isActive: true,
  linkedClientId: "",
  department: "",
  branch: "",
  approvalDiscountLimit: "",
  hourCost: "",
};

const ROLE_OPTIONS: UserRole[] = [
  "NORMAL",
  "ADMIN",
  "MANAGER",
  "SALES",
  "TECHNICIAN",
  "ENGINEER_APPLICATION",
  "LOGISTICS",
  "FINANCE",
  "SUPPLIES",
  "HR",
  "AUDITOR",
  "CLIENT",
];
const SKILL_OPTIONS: SkillLevel[] = [
  "TRAINEE",
  "JUNIOR",
  "PLENO",
  "SENIOR",
  "MASTER",
];
const AVAILABILITY_OPTIONS: UserAvailabilityStatus[] = [
  "AVAILABLE",
  "ON_SERVICE",
  "IN_TRANSIT",
  "OFF_DUTY",
  "VACATION",
];

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  NORMAL: "Usuario",
  TECHNICIAN: "Tecnico",
  SALES: "Comercial",
  ENGINEER_APPLICATION: "Engenharia",
  LOGISTICS: "Logistica",
  FINANCE: "Financeiro",
  SUPPLIES: "Suprimentos",
  HR: "Pessoas/RH",
  AUDITOR: "Auditor",
  CLIENT: "Cliente",
};
const SKILL_LABELS: Record<SkillLevel, string> = {
  TRAINEE: "Trainee",
  JUNIOR: "Junior",
  PLENO: "Pleno",
  SENIOR: "Senior",
  MASTER: "Master",
};
const AVAILABILITY_LABELS: Record<UserAvailabilityStatus, string> = {
  AVAILABLE: "Disponivel",
  ON_SERVICE: "Em atendimento",
  IN_TRANSIT: "Em transito",
  OFF_DUTY: "Fora do expediente",
  VACATION: "Ferias",
};
const APPROVAL_LABELS: Record<PendingApprovalRow["type"], string> = {
  BUDGET_DISCOUNT: "Desconto especial",
  RVT_SIGNOFF: "Aprovacao tecnica",
};
const AUDIT_LABELS: Record<AuditDomain, string> = {
  USERS: "Usuarios",
  MAINTENANCE_ORDERS: "Ordens",
  PROPOSALS: "Propostas",
  CONTRACTS: "Contratos",
  INVENTORY: "Estoque",
  PURCHASE_ORDERS: "Compras",
  FINANCE: "Financeiro",
  PEOPLE: "Pessoas",
};

const PAGE_ITEMS = [
  { key: "dashboard", label: "Dashboard executivo" },
  { key: "proposals", label: "Modulo de propostas" },
  { key: "orders", label: "Ordens e execucao" },
  { key: "contracts", label: "Contratos" },
  { key: "catalog", label: "Catalogo" },
  { key: "clients", label: "Clientes e sites" },
  { key: "equipments", label: "Equipamentos" },
  { key: "finance", label: "Financeiro" },
  { key: "inventory", label: "Estoque e compras" },
  { key: "people", label: "Pessoas/RH" },
  { key: "usersControl", label: "Governanca de usuarios" },
  { key: "tickets", label: "Atendimento/SLA" },
  { key: "serviceReports", label: "Laudos tecnicos" },
  { key: "technicianPortal", label: "Campo tecnico" },
] as const satisfies ReadonlyArray<PermissionItem<keyof AccessPolicy["pages"]>>;
const CLIENT_ITEMS = [
  { key: "view", label: "Visualizar clientes" },
  { key: "create", label: "Criar clientes" },
  { key: "update", label: "Editar clientes" },
  { key: "delete", label: "Excluir clientes" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["clients"]>
>;
const CATALOG_ITEMS = [
  { key: "view", label: "Visualizar catalogo" },
  { key: "create", label: "Criar itens" },
  { key: "update", label: "Editar itens" },
  { key: "delete", label: "Excluir itens" },
  { key: "viewCosts", label: "Ver custos e margem" },
  { key: "manageItems", label: "Editar itens e estruturas" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["catalog"]>
>;
const USER_ITEMS = [
  { key: "manage", label: "Gerenciar usuarios" },
  { key: "manageSecurity", label: "Seguranca e MFA" },
  { key: "manageCertifications", label: "Certificacoes" },
  { key: "manageSpecialties", label: "Especialidades" },
  { key: "manageHierarchy", label: "Hierarquia e gestores" },
  { key: "viewLiveLocation", label: "Localizacao ao vivo" },
] as const satisfies ReadonlyArray<PermissionItem<keyof AccessPolicy["users"]>>;
const PROPOSAL_ITEMS = [
  { key: "view", label: "Visualizar propostas" },
  { key: "create", label: "Criar propostas" },
  { key: "update", label: "Editar propostas" },
  { key: "approve", label: "Aprovar proposta" },
  { key: "cancel", label: "Cancelar/reprovar proposta" },
  {
    key: "requestDiscountAboveLimit",
    label: "Solicitar desconto acima do limite",
  },
  { key: "approveBudget", label: "Aprovar proposta" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["proposals"]>
>;
const CONTRACT_ITEMS = [
  { key: "view", label: "Visualizar contratos" },
  { key: "create", label: "Criar contratos" },
  { key: "update", label: "Editar contratos" },
  { key: "activate", label: "Ativar contratos" },
  { key: "cancel", label: "Cancelar contratos" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["contracts"]>
>;
const ORDER_ACTION_ITEMS = [
  { key: "view", label: "Visualizar OS" },
  { key: "create", label: "Criar OS" },
  { key: "update", label: "Editar OS" },
  { key: "dispatch", label: "Despachar OS" },
  { key: "finish", label: "Finalizar OS" },
  { key: "cancel", label: "Cancelar OS" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["orders"]>
>;
const ORDER_ITEMS = [
  { key: "submitVisitReport", label: "Enviar relatorio de visita" },
  { key: "approveVisitReport", label: "Aprovar relatorio de visita" },
  { key: "assignWithOverride", label: "Alocar com override" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["maintenanceOrders"]>
>;
const TICKET_ITEMS = [
  { key: "view", label: "Visualizar chamados" },
  { key: "viewOwn", label: "Visualizar chamados proprios" },
  { key: "create", label: "Criar chamados" },
  { key: "update", label: "Editar classificacao/status" },
  { key: "assign", label: "Atribuir responsavel" },
  { key: "comment", label: "Comentar/interagir" },
  { key: "commentOwn", label: "Comentar chamados proprios" },
  { key: "convertToOrder", label: "Converter em OS" },
  { key: "resolve", label: "Resolver chamado" },
  { key: "close", label: "Fechar chamado" },
  { key: "cancel", label: "Cancelar chamado" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["tickets"]>
>;
const SERVICE_REPORT_ITEMS = [
  { key: "view", label: "Visualizar laudos" },
  { key: "create", label: "Criar laudos" },
  { key: "update", label: "Editar laudos" },
  { key: "addEvidence", label: "Adicionar evidencias" },
  { key: "sign", label: "Registrar assinatura" },
  { key: "approve", label: "Aprovar laudos" },
  { key: "releaseToCustomer", label: "Liberar ao cliente" },
  { key: "generateDocument", label: "Gerar documento" },
  { key: "manageShareLinks", label: "Gerenciar links publicos" },
  { key: "cancel", label: "Cancelar laudos" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["serviceReports"]>
>;
const INVENTORY_ITEMS = [
  { key: "view", label: "Visualizar estoque" },
  { key: "create", label: "Criar saldo/estrutura" },
  { key: "update", label: "Transferir/atualizar estoque" },
  { key: "reserve", label: "Reservar/liberar material" },
  { key: "consume", label: "Consumir material" },
  { key: "adjust", label: "Ajustar saldo" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["inventory"]>
>;
const PURCHASE_ORDER_ITEMS = [
  { key: "view", label: "Visualizar compras" },
  { key: "create", label: "Criar compras" },
  { key: "update", label: "Editar compras" },
  { key: "approve", label: "Aprovar compras" },
  { key: "receive", label: "Receber compras" },
  { key: "cancel", label: "Cancelar compras" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["purchaseOrders"]>
>;
const FINANCE_ITEMS = [
  { key: "view", label: "Visualizar financeiro" },
  { key: "create", label: "Criar lancamentos" },
  { key: "update", label: "Editar financeiro" },
  { key: "pay", label: "Baixar/pagar" },
  { key: "cancel", label: "Cancelar titulos" },
  { key: "reconcile", label: "Conciliar/sincronizar" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["finance"]>
>;
const PEOPLE_ITEMS = [
  { key: "view", label: "Visualizar pessoas" },
  { key: "create", label: "Criar registros de pessoas" },
  { key: "update", label: "Editar pessoas/RH" },
  { key: "delete", label: "Excluir registros de pessoas" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["people"]>
>;
const TECHNICIAN_ITEMS = [
  { key: "view", label: "Visualizar tecnicos" },
  { key: "dispatch", label: "Despachar tecnico" },
  { key: "schedule", label: "Agenda de tecnicos" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["technicians"]>
>;
const TECHNICIAN_WORK_ITEMS = [
  { key: "view", label: "Visualizar propria fila tecnica" },
  { key: "checkInOut", label: "Check-in/check-out em campo" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["technicianWork"]>
>;
const REPORT_ITEMS = [
  { key: "view", label: "Visualizar relatorios" },
  { key: "export", label: "Exportar relatorios" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["reports"]>
>;
const SETTINGS_ITEMS = [
  { key: "view", label: "Visualizar configuracoes" },
  { key: "update", label: "Editar configuracoes" },
  { key: "admin", label: "Administrar automacoes/empresa" },
] as const satisfies ReadonlyArray<
  PermissionItem<keyof AccessPolicy["settings"]>
>;

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function AccessControlPage() {
  const router = useRouter();
  const viewerAccess = useMemo(() => getAccessFromToken(), []);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [policy, setPolicy] = useState<AccessPolicy>(
    defaultAccessByRole("NORMAL"),
  );
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | UserRole>("ALL");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "INACTIVE"
  >("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [skillFilter, setSkillFilter] = useState<"ALL" | SkillLevel>("ALL");
  const [regionFilter, setRegionFilter] = useState("ALL");
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [auditDomainFilter, setAuditDomainFilter] = useState<
    "ALL" | AuditDomain
  >("ALL");
  const [newUser, setNewUser] = useState<NewUserForm>(EMPTY_NEW_USER);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [presenceRows, setPresenceRows] = useState<PresenceRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<
    PendingApprovalRow[]
  >([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [expiringCerts, setExpiringCerts] = useState<ExpiringCertRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isSelectedMaster = Boolean(selectedUser?.isSystemMaster);
  const departments = useMemo(
    () =>
      [
        ...new Set(
          users.map((user) => (user.department || "").trim()).filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [users],
  );
  const regions = useMemo(
    () =>
      [...new Set(users.flatMap((user) => user.regionTags || []))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [users],
  );
  const managers = useMemo(
    () => users.filter((user) => user.isActive && user.role !== "CLIENT"),
    [users],
  );
  const usersWithExpiringSet = useMemo(
    () => new Set(expiringCerts.map((row) => row.user?.id).filter(Boolean)),
    [expiringCerts],
  );

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();

    return users.filter((user) => {
      if (roleFilter !== "ALL" && user.role !== roleFilter) return false;
      if (statusFilter === "ACTIVE" && !user.isActive) return false;
      if (statusFilter === "INACTIVE" && user.isActive) return false;
      if (
        departmentFilter !== "ALL" &&
        (user.department || "").trim() !== departmentFilter
      ) {
        return false;
      }
      if (skillFilter !== "ALL" && user.skillLevel !== skillFilter)
        return false;
      if (
        regionFilter !== "ALL" &&
        !(user.regionTags || []).includes(regionFilter)
      ) {
        return false;
      }
      if (expiringOnly && !usersWithExpiringSet.has(user.id)) return false;
      if (!term) return true;

      return (
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        (user.department || "").toLowerCase().includes(term) ||
        (user.branch || "").toLowerCase().includes(term) ||
        (user.functionalId || "").toLowerCase().includes(term) ||
        (user.documentId || "").toLowerCase().includes(term)
      );
    });
  }, [
    users,
    query,
    roleFilter,
    statusFilter,
    departmentFilter,
    skillFilter,
    regionFilter,
    expiringOnly,
    usersWithExpiringSet,
  ]);

  const filteredAuditRows = useMemo(
    () =>
      auditDomainFilter === "ALL"
        ? auditRows
        : auditRows.filter((row) => row.domain === auditDomainFilter),
    [auditRows, auditDomainFilter],
  );

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.isActive).length,
      admins: users.filter((user) => user.role === "ADMIN").length,
      live: presenceRows.length,
      approvals: pendingApprovals.length,
      expiring: expiringCerts.length,
    }),
    [users, presenceRows.length, pendingApprovals.length, expiringCerts.length],
  );

  useEffect(() => {
    const record = users.find((user) => user.id === selectedUserId) ?? null;
    setSelectedUser(record ? cloneUser(record) : null);

    if (record) {
      setPolicy(
        normalizeEditableAccessPolicy(
          (record.accessPolicy as AccessPolicy) ||
            defaultAccessByRole(record.role),
        ),
      );
    }
  }, [selectedUserId, users]);

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => filteredUsers.some((user) => user.id === id)),
    );
  }, [filteredUsers]);

  const handleUnauthorized = useCallback(
    async (res: Response) => {
      if (res.status !== 401) return false;
      clearAuthSession();
      router.replace("/");
      return true;
    },
    [router],
  );

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const [
        res,
        presenceRes,
        approvalsRes,
        auditRes,
        expiringRes,
        clientsRes,
      ] = await Promise.all([
        apiFetch("/users"),
        apiFetch("/users/presence/live"),
        apiFetch("/approvals/pending"),
        apiFetch("/audit-logs?limit=120"),
        apiFetch("/users/certifications/expiring?days=30"),
        apiFetch("/clients"),
      ]);

      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiError(res, "Nao foi possivel carregar os usuarios."),
        );
      }

      const data = (await res.json()) as UserRow[];
      const ordered = sortUsers(data);
      setUsers(ordered);
      setSelectedUserId((prev) => {
        if (ordered.length === 0) return "";
        if (prev && ordered.some((user) => user.id === prev)) return prev;
        return ordered[0].id;
      });

      setPresenceRows(
        presenceRes.ok ? ((await presenceRes.json()) as PresenceRow[]) : [],
      );
      setPendingApprovals(
        approvalsRes.ok
          ? ((await approvalsRes.json()) as PendingApprovalRow[])
          : [],
      );
      setAuditRows(auditRes.ok ? ((await auditRes.json()) as AuditRow[]) : []);
      setExpiringCerts(
        expiringRes.ok ? ((await expiringRes.json()) as ExpiringCertRow[]) : [],
      );
      setClients(
        clientsRes.ok ? ((await clientsRes.json()) as ClientOption[]) : [],
      );
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar usuarios.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    if (!viewerAccess.users.manage) {
      router.replace("/dashboard");
      return;
    }
    void loadUsers();
  }, [loadUsers, router, viewerAccess.users.manage]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (
      !newUser.name.trim() ||
      !newUser.email.trim() ||
      !newUser.password.trim()
    ) {
      setError("Preencha nome, email e senha para provisionar o usuario.");
      return;
    }

    if (newUser.password.trim().length < 6) {
      setError("A senha inicial precisa ter ao menos 6 caracteres.");
      return;
    }

    if (newUser.role === "CLIENT" && !newUser.linkedClientId) {
      setError("Selecione o cliente que esta conta externa vai representar.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        password: newUser.password.trim(),
        role: newUser.role,
        isActive: newUser.isActive,
        linkedClientId:
          newUser.role === "CLIENT"
            ? newUser.linkedClientId || undefined
            : undefined,
        department: newUser.department.trim() || undefined,
        branch: newUser.branch.trim() || undefined,
        approvalDiscountLimit: toNumberOrUndefined(
          newUser.approvalDiscountLimit,
        ),
        hourCost: toNumberOrUndefined(newUser.hourCost),
        accessPolicy: defaultAccessByRole(newUser.role),
      };

      const res = await apiFetch("/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiError(res, "Nao foi possivel criar o usuario."),
        );
      }

      const created = (await res.json()) as UserRow;
      setNewUser(EMPTY_NEW_USER);
      setSelectedUserId(created.id);
      setSuccess("Usuario provisionado com sucesso.");
      await loadUsers();
      setSelectedUserId(created.id);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Nao foi possivel criar o usuario.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveSelectedUser() {
    if (!selectedUser) {
      setError("Selecione um usuario para editar.");
      return;
    }

    if (selectedUser.isSystemMaster) {
      setError(
        "O usuario master e protegido e nao pode ser alterado por esta tela.",
      );
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (selectedUser.role === "CLIENT" && !selectedUser.linkedClientId) {
        throw new Error(
          "Selecione o cliente vinculado antes de salvar a conta externa.",
        );
      }

      const payload = {
        name: selectedUser.name.trim(),
        email: selectedUser.email.trim(),
        role: selectedUser.role,
        isActive: selectedUser.isActive,
        linkedClientId:
          selectedUser.role === "CLIENT"
            ? selectedUser.linkedClientId || undefined
            : null,
        department: (selectedUser.department || "").trim() || undefined,
        branch: (selectedUser.branch || "").trim() || undefined,
        approvalDiscountLimit: toNumberOrUndefined(
          selectedUser.approvalDiscountLimit,
        ),
        hourCost: toNumberOrUndefined(selectedUser.hourCost),
        functionalId: (selectedUser.functionalId || "").trim() || undefined,
        documentId: (selectedUser.documentId || "").trim() || undefined,
        managerId: selectedUser.managerId || undefined,
        availabilityStatus: selectedUser.availabilityStatus || undefined,
        skillLevel: selectedUser.skillLevel || undefined,
        regionTags: splitTags(selectedUser.regionTags || []),
        salesTargetMonthly: toNumberOrUndefined(
          selectedUser.salesTargetMonthly,
        ),
        mfaEnabled: Boolean(selectedUser.mfaEnabled),
        accessPolicy: policy,
      };

      const res = await apiFetch(`/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiError(res, "Nao foi possivel salvar o usuario."),
        );
      }

      await loadUsers();
      setSelectedUserId(selectedUser.id);
      setSuccess(`Cadastro de ${selectedUser.name} atualizado com sucesso.`);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Nao foi possivel salvar o usuario.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function applyBulkPatch(
    buildPayload: (user: UserRow) => Record<string, unknown>,
  ) {
    if (selectedIds.length === 0) {
      setError("Selecione ao menos um usuario para acao em lote.");
      return;
    }

    const targets = users.filter(
      (user) => selectedIds.includes(user.id) && !user.isSystemMaster,
    );

    if (targets.length === 0) {
      setError("A selecao atual nao contem usuarios editaveis.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      let updated = 0;
      const failures: string[] = [];

      for (const user of targets) {
        const res = await apiFetch(`/users/${user.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildPayload(user)),
        });

        if (await handleUnauthorized(res)) return;

        if (!res.ok) {
          failures.push(
            `${user.name}: ${await readApiError(res, "nao foi possivel aplicar a alteracao.")}`,
          );
          continue;
        }

        updated += 1;
      }

      await loadUsers();
      setSelectedIds([]);

      if (updated > 0) {
        setSuccess(`${updated} usuario(s) atualizados em lote.`);
      }

      if (failures.length > 0) {
        setError(
          failures.length === 1
            ? failures[0]
            : `${failures[0]} (+${failures.length - 1} pendencia(s))`,
        );
      }

      if (updated === 0 && failures.length === 0) {
        setError("Nenhuma alteracao foi aplicada.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function decideApproval(id: string, decision: "approve" | "reject") {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await apiFetch(
        `/approvals/${id}/${decision === "approve" ? "approve" : "reject"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            decisionNote:
              decision === "approve"
                ? "Aprovacao registrada pelo painel de governanca."
                : "Reprovacao registrada pelo painel de governanca.",
          }),
        },
      );

      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        throw new Error(
          await readApiError(res, "Nao foi possivel registrar a decisao."),
        );
      }

      setSuccess(
        decision === "approve"
          ? "Solicitacao aprovada com sucesso."
          : "Solicitacao rejeitada com sucesso.",
      );
      await loadUsers();
    } catch (approvalError: unknown) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Nao foi possivel registrar a decisao.",
      );
    } finally {
      setSaving(false);
    }
  }

  function updateSelectedUser(changes: Partial<UserRow>) {
    setSelectedUser((prev) => (prev ? { ...prev, ...changes } : prev));
  }

  function resetSelectedUserDraft() {
    const base = users.find((user) => user.id === selectedUserId);
    if (!base) return;
    setSelectedUser(cloneUser(base));
    setPolicy(
      normalizeEditableAccessPolicy(
        (base.accessPolicy as AccessPolicy) || defaultAccessByRole(base.role),
      ),
    );
    setSuccess("");
    setError("");
  }

  function setPagePermission(key: keyof AccessPolicy["pages"], value: boolean) {
    setPolicy((prev) =>
      normalizeEditableAccessPolicy({
        ...prev,
        pages: { ...prev.pages, [key]: value },
      }),
    );
  }

  function setCatalogPermission(
    key: keyof AccessPolicy["catalog"],
    value: boolean,
  ) {
    setPolicy((prev) =>
      normalizeEditableAccessPolicy({
        ...prev,
        catalog: { ...prev.catalog, [key]: value },
      }),
    );
  }

  function setUsersPermission(
    key: keyof AccessPolicy["users"],
    value: boolean,
  ) {
    setPolicy((prev) =>
      normalizeEditableAccessPolicy({
        ...prev,
        users: { ...prev.users, [key]: value },
      }),
    );
  }

  function setProposalPermission(
    key: keyof AccessPolicy["proposals"],
    value: boolean,
  ) {
    setPolicy((prev) =>
      normalizeEditableAccessPolicy({
        ...prev,
        proposals: { ...prev.proposals, [key]: value },
      }),
    );
  }

  function setOrderPermission(
    key: keyof AccessPolicy["maintenanceOrders"],
    value: boolean,
  ) {
    setPolicy((prev) =>
      normalizeEditableAccessPolicy({
        ...prev,
        maintenanceOrders: { ...prev.maintenanceOrders, [key]: value },
      }),
    );
  }

  const setSectionPermission: PermissionSectionSetter = (
    section,
    key,
    value,
  ) => {
    setPolicy((prev) =>
      normalizeEditableAccessPolicy({
        ...prev,
        [section]: {
          ...prev[section],
          [key]: value,
        },
      }),
    );
  };

  function setAuditRead(value: boolean) {
    setPolicy((prev) =>
      normalizeEditableAccessPolicy({
        ...prev,
        audit: { read: value },
      }),
    );
  }

  function toggleSelectAllFiltered() {
    const visibleIds = filteredUsers
      .filter((user) => !user.isSystemMaster)
      .map((user) => user.id);

    if (visibleIds.length === 0) return;

    setSelectedIds((prev) =>
      visibleIds.every((id) => prev.includes(id))
        ? prev.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...prev, ...visibleIds])),
    );
  }

  function toggleSelectOne(id: string, checked: boolean) {
    setSelectedIds((prev) =>
      checked
        ? Array.from(new Set([...prev, id]))
        : prev.filter((item) => item !== id),
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <AccessHero
        stats={stats}
        viewerAccess={viewerAccess}
        isLoading={isLoading}
        saving={saving}
        onRefresh={() => void loadUsers()}
      />

      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {success ? <StatusBanner tone="emerald">{success}</StatusBanner> : null}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.92fr)_minmax(380px,0.88fr)]">
        <ProvisioningCard
          newUser={newUser}
          clients={clients}
          saving={saving}
          onChange={setNewUser}
          onSubmit={handleCreateUser}
        />
        <GovernanceRadar
          viewerAccess={viewerAccess}
          presenceRows={presenceRows}
          pendingApprovals={pendingApprovals}
          expiringCerts={expiringCerts}
          filteredAuditRows={filteredAuditRows}
          auditDomainFilter={auditDomainFilter}
          saving={saving}
          onChangeAuditDomain={setAuditDomainFilter}
          onApprovalDecision={decideApproval}
        />
      </div>

      <ManagementSection
        query={query}
        roleFilter={roleFilter}
        statusFilter={statusFilter}
        departmentFilter={departmentFilter}
        skillFilter={skillFilter}
        regionFilter={regionFilter}
        expiringOnly={expiringOnly}
        departments={departments}
        regions={regions}
        filteredUsers={filteredUsers}
        selectedUserId={selectedUserId}
        selectedUser={selectedUser}
        selectedIds={selectedIds}
        clients={clients}
        managers={managers}
        policy={policy}
        usersWithExpiringSet={usersWithExpiringSet}
        isLoading={isLoading}
        saving={saving}
        isSelectedMaster={isSelectedMaster}
        onQueryChange={setQuery}
        onRoleFilterChange={setRoleFilter}
        onStatusFilterChange={setStatusFilter}
        onDepartmentFilterChange={setDepartmentFilter}
        onSkillFilterChange={setSkillFilter}
        onRegionFilterChange={setRegionFilter}
        onExpiringOnlyChange={setExpiringOnly}
        onToggleSelectAll={toggleSelectAllFiltered}
        onToggleSelectOne={toggleSelectOne}
        onSelectUser={setSelectedUserId}
        onBulkPatch={applyBulkPatch}
        onUpdateSelectedUser={updateSelectedUser}
        onResetSelectedUser={resetSelectedUserDraft}
        onSaveSelectedUser={saveSelectedUser}
        onSetPagePermission={setPagePermission}
        onSetCatalogPermission={setCatalogPermission}
        onSetUsersPermission={setUsersPermission}
        onSetProposalPermission={setProposalPermission}
        onSetOrderPermission={setOrderPermission}
        onSetSectionPermission={setSectionPermission}
        onSetAuditRead={setAuditRead}
        onPolicyChange={setPolicy}
      />
    </div>
  );
}

function AccessHero({
  stats,
  viewerAccess,
  isLoading,
  saving,
  onRefresh,
}: {
  stats: {
    total: number;
    active: number;
    admins: number;
    live: number;
    approvals: number;
    expiring: number;
  };
  viewerAccess: AccessPolicy;
  isLoading: boolean;
  saving: boolean;
  onRefresh: () => void;
}) {
  return (
    <PageHero
      eyebrow="Governanca de Acesso"
      title="Controle de usuarios com menos ruido e mais contexto operacional."
      description="A tela separa provisionamento, visibilidade operacional e edicao de permissoes para que a equipe decida rapido sem navegar por blocos misturados."
      stats={[
        {
          label: "Base total",
          value: String(stats.total),
          helper: `${stats.active} contas ativas e ${stats.admins} perfis administradores.`,
          tone: "slate",
        },
        {
          label: "Rastreamento",
          value: String(stats.live),
          helper: "Usuarios com localizacao viva disponivel agora.",
          tone: "blue",
        },
        {
          label: "Aprovacoes",
          value: String(stats.approvals),
          helper: "Solicitacoes aguardando decisao neste momento.",
          tone: "amber",
        },
        {
          label: "Certificados",
          value: String(stats.expiring),
          helper: "Vencimentos previstos para os proximos 30 dias.",
          tone: "rose",
        },
      ]}
      actions={
        <>
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={onRefresh}
            disabled={isLoading || saving}
          >
            Atualizar dados
          </button>
          <Link href="/dashboard/company-settings" className={SECONDARY_BUTTON}>
            Politicas da empresa
          </Link>
        </>
      }
      aside={
        <div className="rounded-[26px] border border-white/80 bg-white/85 p-4 shadow-[0_20px_50px_-36px_rgba(15,31,50,0.4)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Radar imediato
          </p>
          <div className="mt-4 grid gap-3">
            <MiniInfo
              label="Base ativa"
              value={`${stats.active}/${stats.total}`}
              helper="Volume de contas habilitadas para operacao."
              tone="emerald"
            />
            <MiniInfo
              label="Auditoria"
              value={viewerAccess.audit.read ? "Liberada" : "Restrita"}
              helper={
                viewerAccess.audit.read
                  ? "Seu perfil tambem enxerga o trilho de auditoria."
                  : "O feed abaixo so aparece para quem tem esse escopo."
              }
              tone={viewerAccess.audit.read ? "blue" : "amber"}
            />
          </div>
        </div>
      }
    />
  );
}

function ProvisioningCard({
  newUser,
  clients,
  saving,
  onChange,
  onSubmit,
}: {
  newUser: NewUserForm;
  clients: ClientOption[];
  saving: boolean;
  onChange: Dispatch<SetStateAction<NewUserForm>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <SectionCard
      eyebrow="Provisionamento"
      title="Criar novo usuario"
      description="Entradas novas nascem com a matriz padrao do cargo e podem ser refinadas depois no editor lateral."
    >
      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Nome completo">
            <TextInput
              value={newUser.name}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Ex.: Ana Paula Rodrigues"
            />
          </FormField>
          <FormField label="Email corporativo">
            <TextInput
              type="email"
              value={newUser.email}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, email: event.target.value }))
              }
              placeholder="nome@manitec.com.br"
            />
          </FormField>
          <FormField label="Senha inicial" hint="Minimo 6 caracteres">
            <TextInput
              type="password"
              autoComplete="new-password"
              value={newUser.password}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, password: event.target.value }))
              }
              placeholder="Defina uma senha temporaria"
            />
          </FormField>
          <FormField label="Cargo">
            <SelectInput
              value={newUser.role}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  role: event.target.value as UserRole,
                  linkedClientId:
                    event.target.value === "CLIENT" ? prev.linkedClientId : "",
                }))
              }
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </SelectInput>
          </FormField>
          {newUser.role === "CLIENT" ? (
            <FormField
              label="Cliente vinculado"
              hint="Obrigatorio para o portal externo"
              className="md:col-span-2"
            >
              <SelectInput
                value={newUser.linkedClientId}
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    linkedClientId: event.target.value,
                  }))
                }
              >
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.tradeName || client.companyName}
                  </option>
                ))}
              </SelectInput>
            </FormField>
          ) : null}
          <FormField label="Departamento">
            <TextInput
              value={newUser.department}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  department: event.target.value,
                }))
              }
              placeholder="Operacoes, Comercial..."
            />
          </FormField>
          <FormField label="Filial">
            <TextInput
              value={newUser.branch}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, branch: event.target.value }))
              }
              placeholder="Matriz, Campinas..."
            />
          </FormField>
          <FormField label="Limite de desconto (%)">
            <TextInput
              type="number"
              min="0"
              step="0.1"
              value={newUser.approvalDiscountLimit}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  approvalDiscountLimit: event.target.value,
                }))
              }
              placeholder="7"
            />
          </FormField>
          <FormField label="Custo/hora">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={newUser.hourCost}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, hourCost: event.target.value }))
              }
              placeholder="0,00"
            />
          </FormField>
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
            checked={newUser.isActive}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, isActive: event.target.checked }))
            }
          />
          Conta ja nasce ativa para uso imediato
        </label>

        <InlineMessage>
          O perfil recebe as permissoes padrao do cargo escolhido e pode ser
          refinado na coluna de edicao.
        </InlineMessage>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className={PRIMARY_BUTTON} disabled={saving}>
            {saving ? "Salvando..." : "Criar usuario"}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() => onChange(EMPTY_NEW_USER)}
            disabled={saving}
          >
            Limpar formulario
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function GovernanceRadar({
  viewerAccess,
  presenceRows,
  pendingApprovals,
  expiringCerts,
  filteredAuditRows,
  auditDomainFilter,
  saving,
  onChangeAuditDomain,
  onApprovalDecision,
}: {
  viewerAccess: AccessPolicy;
  presenceRows: PresenceRow[];
  pendingApprovals: PendingApprovalRow[];
  expiringCerts: ExpiringCertRow[];
  filteredAuditRows: AuditRow[];
  auditDomainFilter: "ALL" | AuditDomain;
  saving: boolean;
  onChangeAuditDomain: Dispatch<SetStateAction<"ALL" | AuditDomain>>;
  onApprovalDecision: (
    id: string,
    decision: "approve" | "reject",
  ) => Promise<void>;
}) {
  return (
    <SectionCard
      eyebrow="Governanca"
      title="Radar operacional"
      description="Pendencias mais sensiveis ficam lado a lado para que a decisao aconteca com contexto."
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <FieldBox className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Presenca ao vivo
              </p>
              <p className="text-xs text-slate-500">
                Ultimos sinais de equipes em campo.
              </p>
            </div>
            <DataPill tone="blue">{presenceRows.length} em mapa</DataPill>
          </div>
          {presenceRows.length === 0 ? (
            <EmptyState
              title="Nenhum sinal recente"
              description="Os pings de presenca aparecerao aqui."
            />
          ) : (
            <div className="space-y-3">
              {presenceRows.slice(0, 4).map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {row.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {ROLE_LABELS[row.role]}{" "}
                        {row.latestPresence
                          ? `• ${formatDateTime(row.latestPresence.recordedAt)}`
                          : "• Sem coordenada recente"}
                      </p>
                    </div>
                    <DataPill tone={presenceTone(row.availabilityStatus)}>
                      {AVAILABILITY_LABELS[row.availabilityStatus]}
                    </DataPill>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FieldBox>

        <FieldBox className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Aprovacoes pendentes
              </p>
              <p className="text-xs text-slate-500">
                Decida sem sair do contexto de governanca.
              </p>
            </div>
            <DataPill tone="amber">{pendingApprovals.length} abertas</DataPill>
          </div>
          {pendingApprovals.length === 0 ? (
            <EmptyState
              title="Fila limpa"
              description="Nao ha aprovacoes pendentes neste momento."
            />
          ) : (
            <div className="space-y-3">
              {pendingApprovals.slice(0, 4).map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {APPROVAL_LABELS[row.type]}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.requesterUser?.name ||
                          "Solicitante nao identificado"}{" "}
                        • {row.entityType} • {formatDateTime(row.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={SECONDARY_BUTTON}
                        onClick={() =>
                          void onApprovalDecision(row.id, "reject")
                        }
                        disabled={saving}
                      >
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        className={PRIMARY_BUTTON}
                        onClick={() =>
                          void onApprovalDecision(row.id, "approve")
                        }
                        disabled={saving}
                      >
                        Aprovar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FieldBox>

        <FieldBox className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Certificacoes em risco
              </p>
              <p className="text-xs text-slate-500">
                Janela de 30 dias para agir antes do vencimento.
              </p>
            </div>
            <DataPill tone="rose">{expiringCerts.length} proximas</DataPill>
          </div>
          {expiringCerts.length === 0 ? (
            <EmptyState
              title="Nenhum vencimento proximo"
              description="A base esta regular para este horizonte."
            />
          ) : (
            <div className="space-y-3">
              {expiringCerts.slice(0, 4).map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {row.code}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.user?.name || "Usuario nao identificado"} • vence
                        em {formatDate(row.validUntil)}
                      </p>
                    </div>
                    <DataPill tone="rose">
                      {daysUntil(row.validUntil)} dias
                    </DataPill>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FieldBox>

        <FieldBox className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Trilha de auditoria
              </p>
              <p className="text-xs text-slate-500">
                Ultimos movimentos sensiveis.
              </p>
            </div>
            <div className="w-40">
              <SelectInput
                value={auditDomainFilter}
                onChange={(event) =>
                  onChangeAuditDomain(event.target.value as "ALL" | AuditDomain)
                }
              >
                <option value="ALL">Todos os dominios</option>
                {Object.entries(AUDIT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </SelectInput>
            </div>
          </div>
          {!viewerAccess.audit.read ? (
            <InlineMessage tone="warning">
              Seu perfil atual nao possui a permissao de leitura da auditoria.
            </InlineMessage>
          ) : filteredAuditRows.length === 0 ? (
            <EmptyState
              title="Nenhum evento no filtro atual"
              description="Ajuste o dominio ou aguarde novos registros."
            />
          ) : (
            <div className="space-y-3">
              {filteredAuditRows.slice(0, 5).map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {row.action}
                      </p>
                      <p className="text-xs text-slate-500">
                        {AUDIT_LABELS[row.domain]} • {row.entityType} •{" "}
                        {row.actorUser?.name || "Sistema"}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">
                      {formatDateTime(row.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FieldBox>
      </div>
    </SectionCard>
  );
}

function ManagementSection({
  query,
  roleFilter,
  statusFilter,
  departmentFilter,
  skillFilter,
  regionFilter,
  expiringOnly,
  departments,
  regions,
  filteredUsers,
  selectedUserId,
  selectedUser,
  selectedIds,
  clients,
  managers,
  policy,
  usersWithExpiringSet,
  isLoading,
  saving,
  isSelectedMaster,
  onQueryChange,
  onRoleFilterChange,
  onStatusFilterChange,
  onDepartmentFilterChange,
  onSkillFilterChange,
  onRegionFilterChange,
  onExpiringOnlyChange,
  onToggleSelectAll,
  onToggleSelectOne,
  onSelectUser,
  onBulkPatch,
  onUpdateSelectedUser,
  onResetSelectedUser,
  onSaveSelectedUser,
  onSetPagePermission,
  onSetCatalogPermission,
  onSetUsersPermission,
  onSetProposalPermission,
  onSetOrderPermission,
  onSetSectionPermission,
  onSetAuditRead,
  onPolicyChange,
}: {
  query: string;
  roleFilter: "ALL" | UserRole;
  statusFilter: "ALL" | "ACTIVE" | "INACTIVE";
  departmentFilter: string;
  skillFilter: "ALL" | SkillLevel;
  regionFilter: string;
  expiringOnly: boolean;
  departments: string[];
  regions: string[];
  filteredUsers: UserRow[];
  selectedUserId: string;
  selectedUser: UserRow | null;
  selectedIds: string[];
  clients: ClientOption[];
  managers: UserRow[];
  policy: AccessPolicy;
  usersWithExpiringSet: Set<string | undefined>;
  isLoading: boolean;
  saving: boolean;
  isSelectedMaster: boolean;
  onQueryChange: Dispatch<SetStateAction<string>>;
  onRoleFilterChange: Dispatch<SetStateAction<"ALL" | UserRole>>;
  onStatusFilterChange: Dispatch<SetStateAction<"ALL" | "ACTIVE" | "INACTIVE">>;
  onDepartmentFilterChange: Dispatch<SetStateAction<string>>;
  onSkillFilterChange: Dispatch<SetStateAction<"ALL" | SkillLevel>>;
  onRegionFilterChange: Dispatch<SetStateAction<string>>;
  onExpiringOnlyChange: Dispatch<SetStateAction<boolean>>;
  onToggleSelectAll: () => void;
  onToggleSelectOne: (id: string, checked: boolean) => void;
  onSelectUser: Dispatch<SetStateAction<string>>;
  onBulkPatch: (
    buildPayload: (user: UserRow) => Record<string, unknown>,
  ) => Promise<void>;
  onUpdateSelectedUser: (changes: Partial<UserRow>) => void;
  onResetSelectedUser: () => void;
  onSaveSelectedUser: () => Promise<void>;
  onSetPagePermission: (
    key: keyof AccessPolicy["pages"],
    value: boolean,
  ) => void;
  onSetCatalogPermission: (
    key: keyof AccessPolicy["catalog"],
    value: boolean,
  ) => void;
  onSetUsersPermission: (
    key: keyof AccessPolicy["users"],
    value: boolean,
  ) => void;
  onSetProposalPermission: (
    key: keyof AccessPolicy["proposals"],
    value: boolean,
  ) => void;
  onSetOrderPermission: (
    key: keyof AccessPolicy["maintenanceOrders"],
    value: boolean,
  ) => void;
  onSetSectionPermission: PermissionSectionSetter;
  onSetAuditRead: (value: boolean) => void;
  onPolicyChange: Dispatch<SetStateAction<AccessPolicy>>;
}) {
  return (
    <SectionCard
      eyebrow="Operacao"
      title="Usuarios e permissoes"
      description="A lista principal ficou mais limpa para triagem, enquanto o editor lateral concentra regras, hierarquia e postura de acesso."
      actions={
        <DataPill tone="slate">
          {filteredUsers.length} usuarios em foco
        </DataPill>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <FormField label="Busca">
            <TextInput
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Nome, email, documento..."
            />
          </FormField>
          <FormField label="Cargo">
            <SelectInput
              value={roleFilter}
              onChange={(event) =>
                onRoleFilterChange(event.target.value as "ALL" | UserRole)
              }
            >
              <option value="ALL">Todos</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </SelectInput>
          </FormField>
          <FormField label="Status">
            <SelectInput
              value={statusFilter}
              onChange={(event) =>
                onStatusFilterChange(
                  event.target.value as "ALL" | "ACTIVE" | "INACTIVE",
                )
              }
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Ativos</option>
              <option value="INACTIVE">Inativos</option>
            </SelectInput>
          </FormField>
          <FormField label="Departamento">
            <SelectInput
              value={departmentFilter}
              onChange={(event) => onDepartmentFilterChange(event.target.value)}
            >
              <option value="ALL">Todos</option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </SelectInput>
          </FormField>
          <FormField label="Skill">
            <SelectInput
              value={skillFilter}
              onChange={(event) =>
                onSkillFilterChange(event.target.value as "ALL" | SkillLevel)
              }
            >
              <option value="ALL">Todas</option>
              {SKILL_OPTIONS.map((skill) => (
                <option key={skill} value={skill}>
                  {SKILL_LABELS[skill]}
                </option>
              ))}
            </SelectInput>
          </FormField>
          <FormField label="Regiao">
            <SelectInput
              value={regionFilter}
              onChange={(event) => onRegionFilterChange(event.target.value)}
            >
              <option value="ALL">Todas</option>
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </SelectInput>
          </FormField>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
              checked={expiringOnly}
              onChange={(event) => onExpiringOnlyChange(event.target.checked)}
            />
            Mostrar apenas usuarios com certificacao vencendo
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={onToggleSelectAll}
              disabled={
                filteredUsers.filter((user) => !user.isSystemMaster).length ===
                0
              }
            >
              {filteredUsers
                .filter((user) => !user.isSystemMaster)
                .every((user) => selectedIds.includes(user.id))
                ? "Limpar visiveis"
                : "Selecionar visiveis"}
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => void onBulkPatch(() => ({ isActive: true }))}
              disabled={saving || selectedIds.length === 0}
            >
              Ativar
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => void onBulkPatch(() => ({ isActive: false }))}
              disabled={saving || selectedIds.length === 0}
            >
              Pausar
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => void onBulkPatch(() => ({ mfaEnabled: true }))}
              disabled={saving || selectedIds.length === 0}
            >
              Exigir MFA
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() =>
                void onBulkPatch((user) => ({
                  accessPolicy: defaultAccessByRole(user.role),
                }))
              }
              disabled={saving || selectedIds.length === 0}
            >
              Resetar permissoes
            </button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(380px,0.98fr)]">
          <UserListPanel
            filteredUsers={filteredUsers}
            selectedUserId={selectedUserId}
            selectedIds={selectedIds}
            usersWithExpiringSet={usersWithExpiringSet}
            isLoading={isLoading}
            onSelectUser={onSelectUser}
            onToggleSelectOne={onToggleSelectOne}
          />
          <UserEditorCard
            selectedUser={selectedUser}
            clients={clients}
            managers={managers}
            policy={policy}
            saving={saving}
            isSelectedMaster={isSelectedMaster}
            onUpdateSelectedUser={onUpdateSelectedUser}
            onResetSelectedUser={onResetSelectedUser}
            onSaveSelectedUser={onSaveSelectedUser}
            onSetPagePermission={onSetPagePermission}
            onSetCatalogPermission={onSetCatalogPermission}
            onSetUsersPermission={onSetUsersPermission}
            onSetProposalPermission={onSetProposalPermission}
            onSetOrderPermission={onSetOrderPermission}
            onSetSectionPermission={onSetSectionPermission}
            onSetAuditRead={onSetAuditRead}
            onPolicyChange={onPolicyChange}
          />
        </div>
      </div>
    </SectionCard>
  );
}

function UserListPanel({
  filteredUsers,
  selectedUserId,
  selectedIds,
  usersWithExpiringSet,
  isLoading,
  onSelectUser,
  onToggleSelectOne,
}: {
  filteredUsers: UserRow[];
  selectedUserId: string;
  selectedIds: string[];
  usersWithExpiringSet: Set<string | undefined>;
  isLoading: boolean;
  onSelectUser: Dispatch<SetStateAction<string>>;
  onToggleSelectOne: (id: string, checked: boolean) => void;
}) {
  if (isLoading) {
    return <FieldBox>Carregando base de usuarios...</FieldBox>;
  }

  if (filteredUsers.length === 0) {
    return (
      <EmptyState
        title="Nenhum usuario encontrado"
        description="Revise os filtros aplicados ou cadastre um novo colaborador."
      />
    );
  }

  return (
    <div className="space-y-3">
      {filteredUsers.map((user) => {
        const isSelected = user.id === selectedUserId;
        const isChecked = selectedIds.includes(user.id);
        const isMaster = Boolean(user.isSystemMaster);

        return (
          <div
            key={user.id}
            className={`rounded-[24px] border px-4 py-4 transition ${
              isSelected
                ? "border-sky-300 bg-sky-50/70 shadow-[0_24px_50px_-40px_rgba(19,104,180,0.5)]"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
                checked={isChecked}
                disabled={isMaster}
                onChange={(event) =>
                  onToggleSelectOne(user.id, event.target.checked)
                }
              />
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => onSelectUser(user.id)}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-950">
                        {user.name}
                      </p>
                      <DataPill tone={user.isActive ? "emerald" : "rose"}>
                        {user.isActive ? "Ativo" : "Inativo"}
                      </DataPill>
                      <DataPill tone="slate">{ROLE_LABELS[user.role]}</DataPill>
                      {isMaster ? (
                        <DataPill tone="amber">Master</DataPill>
                      ) : null}
                    </div>
                    <p className="text-sm text-slate-600">{user.email}</p>
                    <div className="flex flex-wrap gap-2">
                      {user.department ? (
                        <DataPill tone="slate">{user.department}</DataPill>
                      ) : null}
                      {user.role === "CLIENT" && user.linkedClient ? (
                        <DataPill tone="blue">
                          {user.linkedClient.tradeName ||
                            user.linkedClient.companyName}
                        </DataPill>
                      ) : null}
                      {user.branch ? (
                        <DataPill tone="slate">{user.branch}</DataPill>
                      ) : null}
                      {user.availabilityStatus ? (
                        <DataPill tone={presenceTone(user.availabilityStatus)}>
                          {AVAILABILITY_LABELS[user.availabilityStatus]}
                        </DataPill>
                      ) : null}
                      {user.mfaEnabled ? (
                        <DataPill tone="blue">MFA ativo</DataPill>
                      ) : null}
                      {usersWithExpiringSet.has(user.id) ? (
                        <DataPill tone="rose">Certificacao critica</DataPill>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>{user.manager?.name || "Sem gestor definido"}</p>
                    <p>
                      {(user.regionTags || []).length > 0
                        ? `${user.regionTags?.length} regioes`
                        : "Escopo regional livre"}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UserEditorCard({
  selectedUser,
  clients,
  managers,
  policy,
  saving,
  isSelectedMaster,
  onUpdateSelectedUser,
  onResetSelectedUser,
  onSaveSelectedUser,
  onSetPagePermission,
  onSetCatalogPermission,
  onSetUsersPermission,
  onSetProposalPermission,
  onSetOrderPermission,
  onSetSectionPermission,
  onSetAuditRead,
  onPolicyChange,
}: {
  selectedUser: UserRow | null;
  clients: ClientOption[];
  managers: UserRow[];
  policy: AccessPolicy;
  saving: boolean;
  isSelectedMaster: boolean;
  onUpdateSelectedUser: (changes: Partial<UserRow>) => void;
  onResetSelectedUser: () => void;
  onSaveSelectedUser: () => Promise<void>;
  onSetPagePermission: (
    key: keyof AccessPolicy["pages"],
    value: boolean,
  ) => void;
  onSetCatalogPermission: (
    key: keyof AccessPolicy["catalog"],
    value: boolean,
  ) => void;
  onSetUsersPermission: (
    key: keyof AccessPolicy["users"],
    value: boolean,
  ) => void;
  onSetProposalPermission: (
    key: keyof AccessPolicy["proposals"],
    value: boolean,
  ) => void;
  onSetOrderPermission: (
    key: keyof AccessPolicy["maintenanceOrders"],
    value: boolean,
  ) => void;
  onSetSectionPermission: PermissionSectionSetter;
  onSetAuditRead: (value: boolean) => void;
  onPolicyChange: Dispatch<SetStateAction<AccessPolicy>>;
}) {
  if (!selectedUser) {
    return (
      <EmptyState
        title="Selecione um usuario"
        description="Escolha um cadastro na lista para abrir o editor detalhado."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-slate-200 bg-white/92 p-5 shadow-[0_24px_70px_-52px_rgba(15,31,50,0.45)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
              Editor detalhado
            </p>
            <h3 className="mt-2 text-2xl font-bold text-slate-950">
              {selectedUser.name}
            </h3>
            <p className="mt-1 text-sm text-slate-600">{selectedUser.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DataPill tone={selectedUser.isActive ? "emerald" : "rose"}>
              {selectedUser.isActive ? "Conta ativa" : "Conta pausada"}
            </DataPill>
            <DataPill tone="slate">{ROLE_LABELS[selectedUser.role]}</DataPill>
            {selectedUser.skillLevel ? (
              <DataPill tone="blue">
                {SKILL_LABELS[selectedUser.skillLevel]}
              </DataPill>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <MiniInfo
            label={
              selectedUser.role === "CLIENT" ? "Cliente vinculado" : "Gestor"
            }
            value={
              selectedUser.role === "CLIENT"
                ? selectedUser.linkedClient?.tradeName ||
                  selectedUser.linkedClient?.companyName ||
                  "Nao vinculado"
                : selectedUser.manager?.name || "Nao definido"
            }
            helper={
              selectedUser.role === "CLIENT"
                ? "Conta externa amarrada ao escopo correto do portal."
                : "Hierarquia usada para roteamento e aprovacoes."
            }
            tone="slate"
          />
          <MiniInfo
            label="Criado em"
            value={
              selectedUser.createdAt
                ? formatDate(selectedUser.createdAt)
                : "Sem data"
            }
            helper="Registro inicial do colaborador."
            tone="blue"
          />
          <MiniInfo
            label="Regioes"
            value={
              (selectedUser.regionTags || []).length > 0
                ? `${selectedUser.regionTags?.length} tags`
                : "Sem restricao"
            }
            helper="Escopo usado em distribuicao e leitura operacional."
            tone="amber"
          />
        </div>

        {isSelectedMaster ? (
          <div className="mt-5">
            <InlineMessage tone="warning">
              O usuario master esta bloqueado para edicao nesta tela.
            </InlineMessage>
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <FormField label="Nome completo">
            <TextInput
              value={selectedUser.name}
              onChange={(event) =>
                onUpdateSelectedUser({ name: event.target.value })
              }
              disabled={isSelectedMaster}
            />
          </FormField>
          <FormField label="Email">
            <TextInput
              type="email"
              value={selectedUser.email}
              onChange={(event) =>
                onUpdateSelectedUser({ email: event.target.value })
              }
              disabled={isSelectedMaster}
            />
          </FormField>
          <FormField label="Cargo">
            <SelectInput
              value={selectedUser.role}
              onChange={(event) => {
                const nextRole = event.target.value as UserRole;
                onUpdateSelectedUser({
                  role: nextRole,
                  linkedClientId:
                    nextRole === "CLIENT" ? selectedUser.linkedClientId : null,
                  linkedClient:
                    nextRole === "CLIENT" ? selectedUser.linkedClient : null,
                  managerId:
                    nextRole === "CLIENT" ? null : selectedUser.managerId,
                  manager: nextRole === "CLIENT" ? null : selectedUser.manager,
                });
                onPolicyChange(
                  normalizeEditableAccessPolicy(defaultAccessByRole(nextRole)),
                );
              }}
              disabled={isSelectedMaster}
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </SelectInput>
          </FormField>
          <FormField label="Status da conta">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/75 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
                checked={selectedUser.isActive}
                onChange={(event) =>
                  onUpdateSelectedUser({ isActive: event.target.checked })
                }
                disabled={isSelectedMaster}
              />
              Conta habilitada para uso
            </label>
          </FormField>
          <FormField label="Departamento">
            <TextInput
              value={selectedUser.department || ""}
              onChange={(event) =>
                onUpdateSelectedUser({ department: event.target.value })
              }
              disabled={isSelectedMaster}
            />
          </FormField>
          <FormField label="Filial">
            <TextInput
              value={selectedUser.branch || ""}
              onChange={(event) =>
                onUpdateSelectedUser({ branch: event.target.value })
              }
              disabled={isSelectedMaster}
            />
          </FormField>
          {selectedUser.role === "CLIENT" ? (
            <FormField
              label="Cliente do portal"
              hint="Obrigatorio para o escopo externo"
            >
              <SelectInput
                value={selectedUser.linkedClientId || ""}
                onChange={(event) => {
                  const nextClientId = event.target.value || null;
                  const client = clients.find(
                    (item) => item.id === nextClientId,
                  );
                  onUpdateSelectedUser({
                    linkedClientId: nextClientId,
                    linkedClient: client
                      ? {
                          id: client.id,
                          companyName: client.companyName,
                          tradeName: client.tradeName || null,
                        }
                      : null,
                  });
                }}
                disabled={isSelectedMaster}
              >
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.tradeName || client.companyName}
                  </option>
                ))}
              </SelectInput>
            </FormField>
          ) : (
            <FormField label="Gestor direto">
              <SelectInput
                value={selectedUser.managerId || ""}
                onChange={(event) => {
                  const nextManagerId = event.target.value || null;
                  const manager = managers.find(
                    (item) => item.id === nextManagerId,
                  );
                  onUpdateSelectedUser({
                    managerId: nextManagerId,
                    manager: manager
                      ? {
                          id: manager.id,
                          name: manager.name,
                          role: manager.role,
                        }
                      : null,
                  });
                }}
                disabled={isSelectedMaster}
              >
                <option value="">Sem gestor</option>
                {managers
                  .filter((manager) => manager.id !== selectedUser.id)
                  .map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name} • {ROLE_LABELS[manager.role]}
                    </option>
                  ))}
              </SelectInput>
            </FormField>
          )}
          <FormField label="Disponibilidade">
            <SelectInput
              value={selectedUser.availabilityStatus || ""}
              onChange={(event) =>
                onUpdateSelectedUser({
                  availabilityStatus:
                    (event.target.value as UserAvailabilityStatus) || undefined,
                })
              }
              disabled={isSelectedMaster}
            >
              <option value="">Nao definido</option>
              {AVAILABILITY_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {AVAILABILITY_LABELS[status]}
                </option>
              ))}
            </SelectInput>
          </FormField>
          <FormField label="Senioridade tecnica">
            <SelectInput
              value={selectedUser.skillLevel || ""}
              onChange={(event) =>
                onUpdateSelectedUser({
                  skillLevel: (event.target.value as SkillLevel) || undefined,
                })
              }
              disabled={isSelectedMaster}
            >
              <option value="">Nao definida</option>
              {SKILL_OPTIONS.map((skill) => (
                <option key={skill} value={skill}>
                  {SKILL_LABELS[skill]}
                </option>
              ))}
            </SelectInput>
          </FormField>
          <FormField label="Limite de desconto (%)">
            <TextInput
              type="number"
              min="0"
              step="0.1"
              value={selectedUser.approvalDiscountLimit ?? ""}
              onChange={(event) =>
                onUpdateSelectedUser({
                  approvalDiscountLimit:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
              disabled={isSelectedMaster}
            />
          </FormField>
          <FormField label="Custo/hora">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={selectedUser.hourCost ?? ""}
              onChange={(event) =>
                onUpdateSelectedUser({
                  hourCost:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
              disabled={isSelectedMaster}
            />
          </FormField>
          <FormField label="Meta comercial mensal">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={selectedUser.salesTargetMonthly ?? ""}
              onChange={(event) =>
                onUpdateSelectedUser({
                  salesTargetMonthly:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
              disabled={isSelectedMaster}
            />
          </FormField>
          <FormField label="ID funcional">
            <TextInput
              value={selectedUser.functionalId || ""}
              onChange={(event) =>
                onUpdateSelectedUser({ functionalId: event.target.value })
              }
              disabled={isSelectedMaster}
            />
          </FormField>
          <FormField label="Documento">
            <TextInput
              value={selectedUser.documentId || ""}
              onChange={(event) =>
                onUpdateSelectedUser({ documentId: event.target.value })
              }
              disabled={isSelectedMaster}
            />
          </FormField>
          <FormField label="Escopo regional" hint="Separe por virgula">
            <TextInput
              value={(selectedUser.regionTags || []).join(", ")}
              onChange={(event) =>
                onUpdateSelectedUser({
                  regionTags: splitTags(event.target.value),
                })
              }
              placeholder="Sudeste, Minas Gerais, Costa"
              disabled={isSelectedMaster}
            />
          </FormField>
        </div>

        <div className="mt-4">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/75 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
              checked={Boolean(selectedUser.mfaEnabled)}
              onChange={(event) =>
                onUpdateSelectedUser({ mfaEnabled: event.target.checked })
              }
              disabled={isSelectedMaster}
            />
            MFA obrigatorio para a conta
          </label>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        <PermissionBlock
          title="Paginas"
          description="Macroareas do dashboard."
          items={PAGE_ITEMS}
          values={policy.pages}
          onToggle={onSetPagePermission}
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Clientes"
          description="Cadastro e manutencao de clientes."
          items={CLIENT_ITEMS}
          values={policy.clients}
          onToggle={(key, value) =>
            onSetSectionPermission("clients", key, value)
          }
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Catalogo"
          description="Custos, margem e manutencao de itens."
          items={CATALOG_ITEMS}
          values={policy.catalog}
          onToggle={onSetCatalogPermission}
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Usuarios"
          description="Perfis, certificacoes, hierarquia e localizacao."
          items={USER_ITEMS}
          values={policy.users}
          onToggle={onSetUsersPermission}
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Propostas"
          description="Fluxos de desconto e aprovacao comercial."
          items={PROPOSAL_ITEMS}
          values={policy.proposals}
          onToggle={onSetProposalPermission}
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Contratos"
          description="Cadastro, ativacao e cancelamento contratual."
          items={CONTRACT_ITEMS}
          values={policy.contracts}
          onToggle={(key, value) =>
            onSetSectionPermission("contracts", key, value)
          }
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Ordens - acoes"
          description="Criacao, despacho, finalizacao e cancelamento de OS."
          items={ORDER_ACTION_ITEMS}
          values={policy.orders}
          onToggle={(key, value) =>
            onSetSectionPermission("orders", key, value)
          }
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Ordens"
          description="Visita, relatorio e override de alocacao."
          items={ORDER_ITEMS}
          values={policy.maintenanceOrders}
          onToggle={onSetOrderPermission}
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Atendimento"
          description="Chamados, SLA, comentarios e conversao para OS."
          items={TICKET_ITEMS}
          values={policy.tickets}
          onToggle={(key, value) =>
            onSetSectionPermission("tickets", key, value)
          }
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Laudos tecnicos"
          description="Checklist, evidencias, assinatura e liberacao ao portal."
          items={SERVICE_REPORT_ITEMS}
          values={policy.serviceReports}
          onToggle={(key, value) =>
            onSetSectionPermission("serviceReports", key, value)
          }
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Estoque"
          description="Reserva, consumo e ajuste de materiais."
          items={INVENTORY_ITEMS}
          values={policy.inventory}
          onToggle={(key, value) =>
            onSetSectionPermission("inventory", key, value)
          }
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Compras"
          description="Pedidos, aprovacao e recebimento."
          items={PURCHASE_ORDER_ITEMS}
          values={policy.purchaseOrders}
          onToggle={(key, value) =>
            onSetSectionPermission("purchaseOrders", key, value)
          }
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Financeiro"
          description="Titulos, pagamentos, cancelamentos e conciliacao."
          items={FINANCE_ITEMS}
          values={policy.finance}
          onToggle={(key, value) =>
            onSetSectionPermission("finance", key, value)
          }
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Pessoas"
          description="Colaboradores, comissoes, banco de horas e ativos."
          items={PEOPLE_ITEMS}
          values={policy.people}
          onToggle={(key, value) =>
            onSetSectionPermission("people", key, value)
          }
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Tecnicos"
          description="Visualizacao, despacho e agenda tecnica."
          items={TECHNICIAN_ITEMS}
          values={policy.technicians}
          onToggle={(key, value) =>
            onSetSectionPermission("technicians", key, value)
          }
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Campo tecnico"
          description="Fila propria do tecnico e apontamento de presenca."
          items={TECHNICIAN_WORK_ITEMS}
          values={policy.technicianWork}
          onToggle={(key, value) =>
            onSetSectionPermission("technicianWork", key, value)
          }
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Relatorios"
          description="Leitura e exportacao de indicadores."
          items={REPORT_ITEMS}
          values={policy.reports}
          onToggle={(key, value) =>
            onSetSectionPermission("reports", key, value)
          }
          disabled={isSelectedMaster}
        />
        <PermissionBlock
          title="Configuracoes"
          description="Empresa, automacoes e parametros administrativos."
          items={SETTINGS_ITEMS}
          values={policy.settings}
          onToggle={(key, value) =>
            onSetSectionPermission("settings", key, value)
          }
          disabled={isSelectedMaster}
        />
        <div className="rounded-[24px] border border-slate-200 bg-white/92 p-4 shadow-[0_18px_40px_-34px_rgba(15,31,50,0.25)]">
          <div>
            <p className="text-sm font-semibold text-slate-950">Auditoria</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Leitura do trilho de eventos e rastreabilidade.
            </p>
          </div>
          <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
            <span>Liberar leitura do feed de auditoria</span>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
              checked={policy.audit.read}
              onChange={(event) => onSetAuditRead(event.target.checked)}
              disabled={isSelectedMaster}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={PRIMARY_BUTTON}
          onClick={() => void onSaveSelectedUser()}
          disabled={saving || isSelectedMaster}
        >
          {saving ? "Salvando..." : "Salvar alteracoes"}
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={onResetSelectedUser}
        >
          Descartar rascunho
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={() =>
            onPolicyChange(
              normalizeEditableAccessPolicy(
                defaultAccessByRole(selectedUser.role),
              ),
            )
          }
          disabled={isSelectedMaster}
        >
          Reaplicar padrao do cargo
        </button>
        <Link href="/dashboard/profile" className={SECONDARY_BUTTON}>
          Ver perfil proprio
        </Link>
      </div>
    </div>
  );
}

function cloneUser(user: UserRow): UserRow {
  return {
    ...user,
    regionTags: [...(user.regionTags || [])],
  };
}

function sortUsers(rows: UserRow[]) {
  return [...rows].sort((a, b) => {
    if (a.isSystemMaster && !b.isSystemMaster) return -1;
    if (!a.isSystemMaster && b.isSystemMaster) return 1;
    return a.name.localeCompare(b.name);
  });
}

function normalizeEditableAccessPolicy(access: AccessPolicy): AccessPolicy {
  const base = defaultAccessByRole("NORMAL");

  return {
    pages: {
      ...base.pages,
      ...access.pages,
    },
    clients: {
      ...base.clients,
      ...access.clients,
    },
    catalog: {
      ...base.catalog,
      ...access.catalog,
    },
    users: {
      ...base.users,
      ...access.users,
    },
    proposals: {
      ...base.proposals,
      ...access.proposals,
    },
    contracts: {
      ...base.contracts,
      ...access.contracts,
    },
    orders: {
      ...base.orders,
      ...access.orders,
    },
    maintenanceOrders: {
      ...base.maintenanceOrders,
      ...access.maintenanceOrders,
    },
    serviceReports: {
      ...base.serviceReports,
      ...access.serviceReports,
    },
    tickets: {
      ...base.tickets,
      ...access.tickets,
    },
    inventory: {
      ...base.inventory,
      ...access.inventory,
    },
    purchaseOrders: {
      ...base.purchaseOrders,
      ...access.purchaseOrders,
    },
    finance: {
      ...base.finance,
      ...access.finance,
    },
    people: {
      ...base.people,
      ...access.people,
    },
    technicians: {
      ...base.technicians,
      ...access.technicians,
    },
    technicianWork: {
      ...base.technicianWork,
      ...access.technicianWork,
    },
    reports: {
      ...base.reports,
      ...access.reports,
    },
    settings: {
      ...base.settings,
      ...access.settings,
    },
    audit: {
      ...base.audit,
      ...access.audit,
    },
  };
}

function toNumberOrUndefined(value: string | number | null | undefined) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitTags(value: string | string[]) {
  const list = Array.isArray(value) ? value : value.split(",");
  return Array.from(new Set(list.map((item) => item.trim()).filter(Boolean)));
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sem registro";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sem registro";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatDate(value?: string | null) {
  if (!value) return "Sem data";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
  }).format(parsed);
}

function daysUntil(value: string) {
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return 0;
  const diff = parsed - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function presenceTone(status: UserAvailabilityStatus): Tone {
  if (status === "AVAILABLE") return "emerald";
  if (status === "ON_SERVICE" || status === "IN_TRANSIT") return "blue";
  if (status === "VACATION") return "amber";
  return "slate";
}

async function readApiError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as {
    message?: string | string[];
  } | null;

  const apiMessage = Array.isArray(body?.message)
    ? body?.message.join("; ")
    : body?.message;

  return apiMessage || fallback;
}

function MiniInfo({
  label,
  value,
  helper,
  tone = "slate",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/90 px-4 py-4 shadow-[0_18px_36px_-32px_rgba(15,31,50,0.35)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </p>
        <DataPill tone={tone}>{value}</DataPill>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">{helper}</p>
    </div>
  );
}

function PermissionBlock<TKey extends string>({
  title,
  description,
  items,
  values,
  onToggle,
  disabled = false,
}: {
  title: string;
  description: string;
  items: ReadonlyArray<PermissionItem<TKey>>;
  values: Record<TKey, boolean>;
  onToggle: (key: TKey, value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/92 p-4 shadow-[0_18px_40px_-34px_rgba(15,31,50,0.25)]">
      <div>
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <label
            key={item.key}
            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700"
          >
            <span>{item.label}</span>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
              checked={values[item.key]}
              onChange={(event) => onToggle(item.key, event.target.checked)}
              disabled={disabled}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
