"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

type Profile = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string | null;
  branch?: string | null;
  profilePhotoUrl?: string | null;
  isActive: boolean;
  mfaEnabled?: boolean | null;
  availabilityStatus?: string | null;
  availabilityUpdatedAt?: string | null;
  updatedAt?: string | null;
};

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  NORMAL: "Usuário",
  TECHNICIAN: "Técnico",
  SALES: "Comercial",
  ENGINEER_APPLICATION: "Engenharia",
  LOGISTICS: "Operação",
  FINANCE: "Financeiro",
  SUPPLIES: "Suprimentos",
  HR: "RH / Agentes",
  AUDITOR: "Auditor",
  CLIENT: "Cliente",
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    department: "",
    branch: "",
    profilePhotoUrl: "",
  });
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await apiFetch("/users/me", { cache: "no-store" });
      if (!res.ok) {
        setError("Nao foi possivel carregar perfil.");
        return;
      }
      const payload = (await res.json()) as Profile;
      setProfile(payload);
      setForm({
        name: payload.name || "",
        email: payload.email || "",
        department: payload.department || "",
        branch: payload.branch || "",
        profilePhotoUrl: payload.profilePhotoUrl || "",
      });
    }

    void load();
  }, []);

  const initials = useMemo(() => {
    return (profile?.name || "U")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }, [profile?.name]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMessage("");
    setError("");

    const body: Record<string, unknown> = {
      name: form.name,
      email: form.email,
      department: form.department || null,
      branch: form.branch || null,
      profilePhotoUrl: form.profilePhotoUrl || null,
    };
    if (password) body.password = password;

    const res = await apiFetch("/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (!res.ok) {
      setError(await readApiErrorMessage(res, "Falha ao salvar perfil."));
      return;
    }

    const updated = (await res.json()) as Profile;
    setProfile(updated);
    setPassword("");
    setMessage("Perfil atualizado com sucesso.");
  }

  if (!profile) {
    return (
      <div className="p-8">
        <p className="text-sm text-zinc-500">Carregando perfil...</p>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 text-xl font-bold text-white">
            {profile.profilePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-slate-950">Meu Perfil</h1>
            <p className="mt-1 text-sm text-slate-500">
              Dados pessoais, segurança da conta e preferências visíveis do usuário.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{roleLabels[profile.role] || profile.role}</Badge>
          <Badge>{profile.isActive ? "Conta ativa" : "Conta inativa"}</Badge>
          <Badge>MFA hibernado</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <form onSubmit={save} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Dados permitidos</h2>
            <p className="mt-1 text-sm text-slate-500">
              Dados administrativos sensíveis ficam nas áreas de Agentes e Controle.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Nome" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} />
            <Input label="E-mail" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} type="email" />
            <ReadOnly label="Cargo/função" value={roleLabels[profile.role] || profile.role} />
            <ReadOnly label="Status operacional" value={profile.availabilityStatus || "Nao informado"} />
            <Input label="Departamento" value={form.department} onChange={(value) => setForm((prev) => ({ ...prev, department: value }))} placeholder="Ex: Operação" />
            <Input label="Filial" value={form.branch} onChange={(value) => setForm((prev) => ({ ...prev, branch: value }))} placeholder="Ex: Matriz" />
            <Input label="Foto/avatar (URL)" value={form.profilePhotoUrl} onChange={(value) => setForm((prev) => ({ ...prev, profilePhotoUrl: value }))} placeholder="https://..." />
            <Input label="Nova senha" value={password} onChange={setPassword} type="password" placeholder="Preencha apenas se quiser alterar" />
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Dados protegidos</p>
            <p className="mt-1">
              Este perfil permite apenas a manutenção de dados pessoais e de acesso da própria conta.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar perfil"}
            </button>
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        </form>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Segurança da conta</h2>
            <div className="mt-4 grid gap-3">
              <ReadOnly label="MFA" value="Hibernado temporariamente" />
              <ReadOnly label="Última atualização" value={formatDateTime(profile.updatedAt)} />
              <ReadOnly label="Última presença" value={formatDateTime(profile.availabilityUpdatedAt)} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Meu Desempenho</h2>
            <div className="mt-4 grid gap-3">
              <PerformanceCard title="OS concluídas" value="Dados insuficientes" />
              <PerformanceCard title="Laudos emitidos" value="Dados insuficientes" />
              <PerformanceCard title="Pendências" value="Dados insuficientes" />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0 text-sm font-semibold text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-600"
      />
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">{value || "-"}</p>
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
      {children}
    </span>
  );
}

function PerformanceCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "Nao evidenciado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
