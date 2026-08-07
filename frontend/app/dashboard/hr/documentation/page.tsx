"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
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
  TextAreaInput,
  TextInput,
} from "../../components/DashboardPageKit";

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

type Collaborator = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string | null;
  branch?: string | null;
  isActive: boolean;
  technicianProfile?: { id: string } | null;
};

type CertificationScope = "SAFETY" | "TECHNICAL";

type CertificationRow = {
  id: string;
  userId: string;
  code: string;
  scope: CertificationScope;
  issuer?: string | null;
  validUntil: string;
  metadata?: {
    notes?: string;
  } | null;
};

type CertificationForm = {
  id: string;
  code: string;
  scope: CertificationScope;
  issuer: string;
  validUntil: string;
  notes: string;
};

const EMPTY_CERTIFICATION_FORM: CertificationForm = {
  id: "",
  code: "",
  scope: "SAFETY",
  issuer: "",
  validUntil: "",
  notes: "",
};

const SCOPE_LABELS: Record<CertificationScope, string> = {
  SAFETY: "NR / Seguranca",
  TECHNICAL: "Tecnico / Ferramentas",
};

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

export default function DocumentationPage() {
  const access = useMemo(() => getAccessFromToken(), []);
  const canManageCertifications = access.users.manageCertifications === true;
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [certifications, setCertifications] = useState<CertificationRow[]>([]);
  const [form, setForm] = useState<CertificationForm>(
    EMPTY_CERTIFICATION_FORM,
  );
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"ALL" | CertificationScope>(
    "ALL",
  );
  const [loading, setLoading] = useState(true);
  const [certificationsLoading, setCertificationsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedUser = collaborators.find((user) => user.id === selectedUserId);

  const filteredCollaborators = useMemo(() => {
    const term = query.trim().toLowerCase();
    return collaborators.filter((user) => {
      if (!term) return true;
      return `${user.name} ${user.email} ${user.role} ${user.department || ""} ${user.branch || ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [collaborators, query]);

  const filteredCertifications = useMemo(
    () =>
      scopeFilter === "ALL"
        ? certifications
        : certifications.filter((cert) => cert.scope === scopeFilter),
    [certifications, scopeFilter],
  );

  const expiringCount = certifications.filter(
    (cert) => daysUntil(cert.validUntil) <= 30,
  ).length;

  async function loadCollaborators() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/hr-admin/collaborators", {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(
            res,
            "Nao foi possivel carregar os colaboradores.",
          ),
        );
      }

      const rows = ((await res.json()) as Collaborator[]).filter(
        (user) => user.role !== "CLIENT",
      );
      setCollaborators(rows);
      setSelectedUserId((prev) => {
        if (prev && rows.some((user) => user.id === prev)) return prev;
        return rows[0]?.id || "";
      });
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nao foi possivel carregar colaboradores.",
      );
    } finally {
      setLoading(false);
    }
  }

  const loadCertifications = useCallback(async (userId: string) => {
    if (!canManageCertifications) {
      setCertifications([]);
      return;
    }

    setCertificationsLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/users/${userId}/certifications`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(
            res,
            "Nao foi possivel carregar a documentacao do colaborador.",
          ),
        );
      }

      const rows = (await res.json()) as CertificationRow[];
      setCertifications(
        rows.sort(
          (a, b) =>
            new Date(a.validUntil).getTime() -
            new Date(b.validUntil).getTime(),
        ),
      );
    } catch (loadError: unknown) {
      setCertifications([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nao foi possivel carregar documentacao.",
      );
    } finally {
      setCertificationsLoading(false);
    }
  }, [canManageCertifications]);

  useEffect(() => {
    void loadCollaborators();
  }, []);

  useEffect(() => {
    setForm(EMPTY_CERTIFICATION_FORM);
    if (!selectedUserId) {
      setCertifications([]);
      return;
    }

    void loadCertifications(selectedUserId);
  }, [loadCertifications, selectedUserId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedUser) {
      setError("Selecione um colaborador.");
      return;
    }

    if (!canManageCertifications) {
      setError("Seu perfil nao possui permissao para editar certificacoes.");
      return;
    }

    if (!form.code.trim() || !form.validUntil) {
      setError("Informe codigo e validade do documento.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        scope: form.scope,
        issuer: form.issuer.trim() || undefined,
        validUntil: form.validUntil,
        metadata: form.notes.trim() ? { notes: form.notes.trim() } : undefined,
      };
      const isEditing = Boolean(form.id);
      const res = await apiFetch(
        isEditing
          ? `/users/${selectedUser.id}/certifications/${form.id}`
          : `/users/${selectedUser.id}/certifications`,
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(
            res,
            "Nao foi possivel salvar a documentacao.",
          ),
        );
      }

      setForm(EMPTY_CERTIFICATION_FORM);
      setMessage(
        isEditing
          ? "Documento atualizado com sucesso."
          : "Documento cadastrado com sucesso.",
      );
      await loadCertifications(selectedUser.id);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Nao foi possivel salvar a documentacao.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteCertification(certificationId: string) {
    if (!selectedUser) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const res = await apiFetch(
        `/users/${selectedUser.id}/certifications/${certificationId}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        throw new Error(
          await readApiErrorMessage(
            res,
            "Nao foi possivel remover a documentacao.",
          ),
        );
      }

      setForm(EMPTY_CERTIFICATION_FORM);
      setMessage("Documento removido com sucesso.");
      await loadCertifications(selectedUser.id);
    } catch (deleteError: unknown) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Nao foi possivel remover a documentacao.",
      );
    } finally {
      setSaving(false);
    }
  }

  function editCertification(certification: CertificationRow) {
    setForm({
      id: certification.id,
      code: certification.code,
      scope: certification.scope,
      issuer: certification.issuer || "",
      validUntil: toDateInputValue(certification.validUntil),
      notes:
        certification.metadata &&
        typeof certification.metadata.notes === "string"
          ? certification.metadata.notes
          : "",
    });
  }

  return (
    <div className="space-y-6 pb-4">
      <PageHero
        eyebrow="Pessoas / Seguranca"
        title="Documentacao de colaboradores"
        description="Base operacional para NR, treinamentos, liberacoes tecnicas e vencimentos. O dashboard apenas resume estes registros."
        stats={[
          {
            label: "Colaboradores",
            value: String(collaborators.length),
            helper: "Contas internas disponiveis para documentacao.",
            tone: "slate",
          },
          {
            label: "Selecionado",
            value: selectedUser ? selectedUser.name : "-",
            helper: selectedUser?.department || "Escolha um colaborador.",
            tone: "blue",
          },
          {
            label: "Documentos",
            value: String(certifications.length),
            helper: `${expiringCount} vencendo em ate 30 dias.`,
            tone: expiringCount > 0 ? "rose" : "emerald",
          },
        ]}
      />

      {message ? <StatusBanner tone="emerald">{message}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}
      {!canManageCertifications ? (
        <StatusBanner tone="amber">
          Seu usuario consegue acessar Pessoas, mas ainda nao possui a permissao
          de Certificacoes. Um administrador deve liberar Usuarios &gt;
          Certificacoes no perfil.
        </StatusBanner>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
        <SectionCard
          eyebrow="Colaboradores"
          title="Base de pessoas"
          description="Selecione o colaborador para consultar ou atualizar a documentacao."
          actions={
            <button
              type="button"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => void loadCollaborators()}
              disabled={loading}
            >
              Atualizar
            </button>
          }
        >
          <div className="space-y-4">
            <FormField label="Busca">
              <TextInput
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nome, e-mail, cargo, departamento"
              />
            </FormField>

            {loading ? (
              <InlineMessage>Carregando colaboradores...</InlineMessage>
            ) : filteredCollaborators.length === 0 ? (
              <EmptyState
                title="Nenhum colaborador encontrado"
                description="Ajuste a busca ou revise permissao de pessoas."
              />
            ) : (
              <div className="space-y-2">
                {filteredCollaborators.map((user) => {
                  const selected = user.id === selectedUserId;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedUserId(user.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-sky-300 bg-sky-50 text-slate-950"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {user.name}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {user.email}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {ROLE_LABELS[user.role]} -{" "}
                            {user.department || "Sem departamento"}
                          </p>
                        </div>
                        {user.technicianProfile ? (
                          <DataPill tone="blue">Tecnico</DataPill>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Documentacao"
          title={selectedUser ? selectedUser.name : "Selecione um colaborador"}
          description="Cadastre NR-35, NR-10, SEP, treinamentos, liberacoes de ferramentas e outros documentos por validade."
        >
          {!selectedUser ? (
            <EmptyState
              title="Nenhum colaborador selecionado"
              description="Escolha alguem na lista para abrir os registros."
            />
          ) : (
            <div className="space-y-5">
              <FieldBox>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {selectedUser.email}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {ROLE_LABELS[selectedUser.role]} -{" "}
                      {selectedUser.branch || "Sem filial"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <DataPill tone={selectedUser.isActive ? "emerald" : "rose"}>
                      {selectedUser.isActive ? "Ativo" : "Inativo"}
                    </DataPill>
                    <DataPill tone={expiringCount > 0 ? "rose" : "slate"}>
                      {expiringCount} vencendo
                    </DataPill>
                  </div>
                </div>
              </FieldBox>

              <form
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-2"
                onSubmit={(event) => void handleSubmit(event)}
              >
                <FormField label="Codigo">
                  <TextInput
                    value={form.code}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        code: event.target.value,
                      }))
                    }
                    placeholder="NR-35"
                    disabled={!canManageCertifications || saving}
                  />
                </FormField>
                <FormField label="Tipo">
                  <SelectInput
                    value={form.scope}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        scope: event.target.value as CertificationScope,
                      }))
                    }
                    disabled={!canManageCertifications || saving}
                  >
                    {Object.entries(SCOPE_LABELS).map(([scope, label]) => (
                      <option key={scope} value={scope}>
                        {label}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
                <FormField label="Emissor">
                  <TextInput
                    value={form.issuer}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        issuer: event.target.value,
                      }))
                    }
                    placeholder="SENAI, fornecedor, interno"
                    disabled={!canManageCertifications || saving}
                  />
                </FormField>
                <FormField label="Validade">
                  <TextInput
                    type="date"
                    value={form.validUntil}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        validUntil: event.target.value,
                      }))
                    }
                    disabled={!canManageCertifications || saving}
                  />
                </FormField>
                <FormField label="Observacoes" className="md:col-span-2">
                  <TextAreaInput
                    value={form.notes}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        notes: event.target.value,
                      }))
                    }
                    placeholder="Ex.: treinamento de trabalho em altura, reciclagem, documento anexado no RH."
                    disabled={!canManageCertifications || saving}
                  />
                </FormField>
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <button
                    type="submit"
                    className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canManageCertifications || saving}
                  >
                    {saving
                      ? "Salvando..."
                      : form.id
                        ? "Atualizar documento"
                        : "Adicionar documento"}
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => setForm(EMPTY_CERTIFICATION_FORM)}
                    disabled={saving}
                  >
                    Novo / limpar
                  </button>
                </div>
              </form>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <FormField label="Filtro por tipo" className="min-w-60">
                  <SelectInput
                    value={scopeFilter}
                    onChange={(event) =>
                      setScopeFilter(
                        event.target.value as "ALL" | CertificationScope,
                      )
                    }
                  >
                    <option value="ALL">Todos</option>
                    {Object.entries(SCOPE_LABELS).map(([scope, label]) => (
                      <option key={scope} value={scope}>
                        {label}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
                <button
                  type="button"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => void loadCertifications(selectedUser.id)}
                  disabled={certificationsLoading || !canManageCertifications}
                >
                  Recarregar documentos
                </button>
              </div>

              {certificationsLoading ? (
                <InlineMessage>Carregando documentos...</InlineMessage>
              ) : filteredCertifications.length === 0 ? (
                <EmptyState
                  title="Nenhum documento encontrado"
                  description="Cadastre NR-35, NR-10, SEP ou outro documento usando o formulario acima."
                />
              ) : (
                <div className="space-y-3">
                  {filteredCertifications.map((certification) => {
                    const remainingDays = daysUntil(certification.validUntil);
                    const warning = remainingDays <= 30;
                    const notes =
                      certification.metadata &&
                      typeof certification.metadata.notes === "string"
                        ? certification.metadata.notes
                        : "";

                    return (
                      <div
                        key={certification.id}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">
                              {certification.code}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {SCOPE_LABELS[certification.scope]}
                              {certification.issuer
                                ? ` - ${certification.issuer}`
                                : ""}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Validade: {formatDate(certification.validUntil)}
                            </p>
                            {notes ? (
                              <p className="mt-2 text-xs leading-5 text-slate-600">
                                {notes}
                              </p>
                            ) : null}
                          </div>
                          <DataPill tone={warning ? "rose" : "emerald"}>
                            {remainingDays} dia(s)
                          </DataPill>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => editCertification(certification)}
                            disabled={!canManageCertifications || saving}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() =>
                              void deleteCertification(certification.id)
                            }
                            disabled={!canManageCertifications || saving}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(
    parsed,
  );
}

function toDateInputValue(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function daysUntil(value: string) {
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return 0;
  const diff = parsed - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
