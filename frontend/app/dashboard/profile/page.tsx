"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

type Profile = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string | null;
  branch?: string | null;
  approvalDiscountLimit?: number | null;
  hourCost?: number | null;
};

const API_URL = apiUrl("");

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem("manitec_token");
      if (!token) return;

      const res = await apiFetch(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        setProfile(null);
        setMessage("Nao foi possivel carregar perfil.");
        return;
      }
      setProfile((await res.json()) as Profile);
    }

    void load();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;

    const token = localStorage.getItem("manitec_token");
    if (!token) {
      setMessage("Sessao expirada. Faca login novamente.");
      return;
    }

    const body: Record<string, unknown> = {
      name: profile.name,
      email: profile.email,
      department: profile.department || null,
      branch: profile.branch || null,
      hourCost: profile.hourCost ?? null,
      approvalDiscountLimit: profile.approvalDiscountLimit ?? null,
    };
    if (password) body.password = password;

    const res = await apiFetch(`${API_URL}/users/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setMessage("Falha ao salvar perfil.");
      return;
    }

    setMessage("Perfil atualizado.");
    setPassword("");
    setProfile((await res.json()) as Profile);
  }

  if (!profile) {
    return (
      <div className="p-8">
        <p className="text-sm text-zinc-500">Carregando perfil...</p>
        {message ? <p className="mt-2 text-sm text-zinc-600">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-3xl font-bold text-zinc-900">Meu Perfil</h1>

      <form onSubmit={save} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input label="Nome" value={profile.name} onChange={(value) => setProfile((prev) => (prev ? { ...prev, name: value } : prev))} />
          <Input label="E-mail" value={profile.email} onChange={(value) => setProfile((prev) => (prev ? { ...prev, email: value } : prev))} />
          <Input label="Perfil" value={profile.role} onChange={() => undefined} disabled />
          <Input label="Departamento" value={profile.department || ""} onChange={(value) => setProfile((prev) => (prev ? { ...prev, department: value } : prev))} />
          <Input label="Filial" value={profile.branch || ""} onChange={(value) => setProfile((prev) => (prev ? { ...prev, branch: value } : prev))} />
          <Input
            label="Custo hora (HH)"
            value={String(profile.hourCost ?? "")}
            onChange={(value) => setProfile((prev) => (prev ? { ...prev, hourCost: value === "" ? null : Number(value) } : prev))}
          />
          <Input
            label="Alcada desconto (%)"
            value={String(profile.approvalDiscountLimit ?? "")}
            onChange={(value) => setProfile((prev) => (prev ? { ...prev, approvalDiscountLimit: value === "" ? null : Number(value) } : prev))}
          />
          <Input label="Nova senha" value={password} onChange={setPassword} type="password" />
        </div>

        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
          Salvar alteracoes
        </button>
        {message ? <p className="text-sm text-zinc-600">{message}</p> : null}
      </form>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-zinc-700">
      {label}
      <input
        type={type}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-zinc-100"
      />
    </label>
  );
}
