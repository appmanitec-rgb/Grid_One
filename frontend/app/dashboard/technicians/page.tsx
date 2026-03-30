"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";
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

type TechnicianOrder = {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  scheduledTo?: string | null;
};

type TechnicianCertification = {
  id: string;
  code: string;
  validUntil: string;
  issuer?: string | null;
};

type TechnicianRow = {
  id: string;
  userId: string;
  cpf: string;
  phone: string;
  skills: string[];
  latitude?: number | null;
  longitude?: number | null;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    department?: string | null;
  };
  orders: TechnicianOrder[];
  certifications: TechnicianCertification[];
};

type CollaboratorOption = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  technicianProfile?: { id: string } | null;
};

type TechnicianForm = {
  userId: string;
  cpf: string;
  phone: string;
  skills: string;
  latitude: string;
  longitude: string;
};

const API_URL = apiUrl("");

const EMPTY_FORM: TechnicianForm = {
  userId: "",
  cpf: "",
  phone: "",
  skills: "",
  latitude: "",
  longitude: "",
};

export default function TechniciansPage() {
  const [technicians, setTechnicians] = useState<TechnicianRow[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorOption[]>([]);
  const [form, setForm] = useState<TechnicianForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const editingTechnician = useMemo(
    () => technicians.find((row) => row.id === editingId) || null,
    [technicians, editingId],
  );

  const availableUsers = useMemo(() => {
    return collaborators
      .filter((user) => {
        if (!user.isActive) return false;
        if (editingTechnician?.userId === user.id) return true;
        return !user.technicianProfile;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [collaborators, editingTechnician]);

  const kpis = useMemo(() => {
    const total = technicians.length;
    const active = technicians.filter((row) => row.user.isActive).length;
    const inDispatch = technicians.filter((row) =>
      row.orders.some((order) => order.status === "OPEN" || order.status === "IN_PROGRESS"),
    ).length;

    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + 30);

    const nr35Expiring = technicians.filter((row) =>
      row.certifications.some((cert) => {
        if (!cert.code.toUpperCase().includes("NR-35")) return false;
        return new Date(cert.validUntil) <= warningDate;
      }),
    ).length;

    return { total, active, inDispatch, nr35Expiring };
  }, [technicians]);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [techniciansRes, collaboratorsRes] = await Promise.all([
        apiFetch(`${API_URL}/technicians`, { cache: "no-store" }),
        apiFetch(`${API_URL}/hr-admin/collaborators`, { cache: "no-store" }),
      ]);

      if (!techniciansRes.ok || !collaboratorsRes.ok) {
        throw new Error("Falha ao carregar equipe tecnica.");
      }

      setTechnicians((await techniciansRes.json()) as TechnicianRow[]);
      setCollaborators((await collaboratorsRes.json()) as CollaboratorOption[]);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar equipe tecnica.",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function fillFormFromRow(row: TechnicianRow) {
    setForm({
      userId: row.userId,
      cpf: row.cpf,
      phone: row.phone,
      skills: row.skills.join(", "),
      latitude:
        row.latitude !== null && row.latitude !== undefined
          ? String(row.latitude)
          : "",
      longitude:
        row.longitude !== null && row.longitude !== undefined
          ? String(row.longitude)
          : "",
    });
    setEditingId(row.id);
    setMessage("");
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!editingId && !form.userId) {
      setError("Selecione um usuario para criar o tecnico.");
      return;
    }

    const skills = form.skills
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (skills.length === 0) {
      setError("Informe ao menos uma skill tecnica.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ...(editingId ? {} : { userId: form.userId }),
        cpf: form.cpf.trim(),
        phone: form.phone.trim(),
        skills,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
      };

      const res = await apiFetch(
        editingId ? `${API_URL}/technicians/${editingId}` : `${API_URL}/technicians`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const apiMessage = Array.isArray(body?.message)
          ? body?.message.join("; ")
          : body?.message;
        throw new Error(apiMessage || "Nao foi possivel salvar tecnico.");
      }

      setMessage(
        editingId
          ? "Tecnico atualizado com sucesso."
          : "Tecnico criado com sucesso.",
      );
      resetForm();
      await loadData();
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Nao foi possivel salvar tecnico.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: TechnicianRow) {
    const confirmed = window.confirm(`Deseja remover o tecnico ${row.user.name}?`);
    if (!confirmed) return;

    setMessage("");
    setError("");

    try {
      const res = await apiFetch(`${API_URL}/technicians/${row.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const apiMessage = Array.isArray(body?.message)
          ? body?.message.join("; ")
          : body?.message;
        throw new Error(apiMessage || "Nao foi possivel remover tecnico.");
      }

      if (editingId === row.id) {
        resetForm();
      }

      setMessage("Tecnico removido com sucesso.");
      await loadData();
    } catch (removeError: unknown) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Nao foi possivel remover tecnico.",
      );
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        eyebrow="Operacao & campo"
        title="Equipe de Tecnicos"
        description="Cadastro operacional com skills, capacidade de despacho e validade de certificacoes. A tela foi reorganizada para separar melhor cadastro, leitura de carga e manutencao da equipe."
        stats={[
          {
            label: "Tecnicos",
            value: String(kpis.total),
            helper: "perfis tecnicos cadastrados",
            tone: "blue",
          },
          {
            label: "Ativos",
            value: String(kpis.active),
            helper: "disponiveis no ecossistema",
            tone: "emerald",
          },
          {
            label: "Em despacho",
            value: String(kpis.inDispatch),
            helper: "com O.S. aberta ou em andamento",
            tone: "slate",
          },
          {
            label: "NR-35 a vencer",
            value: String(kpis.nr35Expiring),
            helper: "exigem olhar rapido do gestor",
            tone: kpis.nr35Expiring > 0 ? "amber" : "slate",
          },
        ]}
        aside={
          editingId ? (
            <InlineMessage tone="warning">
              Editando o cadastro de{" "}
              <strong>{editingTechnician?.user.name || "tecnico selecionado"}</strong>.
            </InlineMessage>
          ) : (
            <InlineMessage>
              Use este painel para organizar skills, cobertura geografica e carga atual da equipe
              sem misturar tudo no mesmo bloco visual.
            </InlineMessage>
          )
        }
      />

      {message ? <StatusBanner tone="emerald">{message}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.35fr)]">
        <SectionCard
          eyebrow="Cadastro"
          title={editingId ? "Atualizar tecnico" : "Novo tecnico"}
          description="Os campos principais ficam concentrados aqui para o gestor cadastrar ou corrigir dados sem disputar espaco com a tabela."
          actions={
            editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar edicao
              </button>
            ) : (
              <DataPill tone="blue">
                {availableUsers.length} colaboradores disponiveis
              </DataPill>
            )
          }
        >
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            {editingId ? (
              <FormField label="Usuario" className="md:col-span-2">
                <FieldBox>
                  Usuario vinculado: {editingTechnician?.user.name || "-"}
                </FieldBox>
              </FormField>
            ) : (
              <FormField label="Usuario" className="md:col-span-2">
                <SelectInput
                  value={form.userId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, userId: event.target.value }))
                  }
                  required
                >
                  <option value="">Selecionar usuario</option>
                  {availableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role})
                    </option>
                  ))}
                </SelectInput>
              </FormField>
            )}

            <FormField label="CPF">
              <TextInput
                value={form.cpf}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, cpf: event.target.value }))
                }
                placeholder="CPF"
                required
              />
            </FormField>

            <FormField label="Telefone">
              <TextInput
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                placeholder="Telefone"
                required
              />
            </FormField>

            <FormField label="Latitude" hint="Opcional">
              <TextInput
                value={form.latitude}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, latitude: event.target.value }))
                }
                placeholder="Latitude"
                type="number"
                step="0.000001"
              />
            </FormField>

            <FormField label="Longitude" hint="Opcional">
              <TextInput
                value={form.longitude}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, longitude: event.target.value }))
                }
                placeholder="Longitude"
                type="number"
                step="0.000001"
              />
            </FormField>

            <FormField
              label="Skills"
              className="md:col-span-2"
              hint="Separadas por virgula"
            >
              <TextInput
                value={form.skills}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, skills: event.target.value }))
                }
                placeholder="Ex: eletrica, paralelismo, nr-35"
                required
              />
            </FormField>

            <div className="flex flex-wrap gap-3 md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_32px_-24px_rgba(15,31,50,0.7)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? "Salvando..."
                  : editingId
                    ? "Atualizar tecnico"
                    : "Cadastrar tecnico"}
              </button>
              {!editingId ? (
                <div className="flex items-center">
                  <DataPill tone="slate">
                    Cobertura e capacidade no mesmo painel
                  </DataPill>
                </div>
              ) : null}
            </div>
          </form>
        </SectionCard>

        <SectionCard
          eyebrow="Operacao"
          title="Quadro atual da equipe"
          description="A tabela foi deixada mais respirada para leitura rapida de contato, carga, certificacoes e localizacao."
          actions={
            loading ? (
              <DataPill tone="slate">Atualizando</DataPill>
            ) : (
              <DataPill tone="blue">{technicians.length} perfis exibidos</DataPill>
            )
          }
        >
          {loading ? (
            <EmptyState
              title="Carregando equipe tecnica"
              description="Buscando tecnicos, certificacoes e ordens vinculadas."
            />
          ) : technicians.length === 0 ? (
            <EmptyState
              title="Nenhum tecnico cadastrado"
              description="Assim que o primeiro perfil tecnico for criado, ele aparece aqui com carga, skills e rastreio."
            />
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-4 py-3">Tecnico</th>
                      <th className="px-4 py-3">Contato</th>
                      <th className="px-4 py-3">Skills</th>
                      <th className="px-4 py-3">Carga</th>
                      <th className="px-4 py-3">Certificacoes</th>
                      <th className="px-4 py-3">Posicao</th>
                      <th className="px-4 py-3 text-right">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {technicians.map((row) => {
                      const openOrders = row.orders.filter(
                        (order) =>
                          order.status === "OPEN" ||
                          order.status === "IN_PROGRESS",
                      );
                      const nextCertification = row.certifications[0];
                      const hasCoordinates =
                        row.latitude !== null &&
                        row.latitude !== undefined &&
                        row.longitude !== null &&
                        row.longitude !== undefined;

                      return (
                        <tr
                          key={row.id}
                          className="align-top transition hover:bg-slate-50/70"
                        >
                          <td className="px-4 py-4">
                            <p className="font-semibold text-slate-900">
                              {row.user.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {row.user.email}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {row.user.role}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-slate-700">
                            <p>CPF: {row.cpf}</p>
                            <p className="mt-1">Tel: {row.phone}</p>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex max-w-xs flex-wrap gap-1.5">
                              {row.skills.map((skill) => (
                                <DataPill key={`${row.id}-${skill}`} tone="slate">
                                  {skill}
                                </DataPill>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-slate-700">
                            <DataPill tone={openOrders.length > 0 ? "amber" : "slate"}>
                              {openOrders.length} O.S. abertas
                            </DataPill>
                            <div className="mt-2 space-y-1">
                              {openOrders.slice(0, 2).map((order) => (
                                <p key={order.id} className="text-xs text-slate-500">
                                  {order.title} ({order.status})
                                </p>
                              ))}
                              {openOrders.length === 0 ? (
                                <p className="text-xs text-slate-500">
                                  Sem ordens em andamento.
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-slate-700">
                            <p className="font-medium text-slate-800">
                              {row.certifications.length} registro(s)
                            </p>
                            {nextCertification ? (
                              <p className="mt-1 text-xs text-slate-500">
                                {nextCertification.code} ate{" "}
                                {new Date(
                                  nextCertification.validUntil,
                                ).toLocaleDateString("pt-BR")}
                              </p>
                            ) : (
                              <p className="mt-1 text-xs text-slate-500">
                                Sem certificacao cadastrada
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-4 text-slate-700">
                            {hasCoordinates ? (
                              <p>
                                {row.latitude?.toFixed(6)}, {row.longitude?.toFixed(6)}
                              </p>
                            ) : (
                              <span className="text-slate-500">Nao informado</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => fillFormFromRow(row)}
                                className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(row)}
                                className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                              >
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
