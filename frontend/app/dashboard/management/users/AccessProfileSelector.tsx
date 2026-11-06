"use client";

import { useEffect, useId, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { UserAccessProfile } from "@/lib/access-profiles";
import { InlineMessage, SelectInput } from "../../components/DashboardPageKit";

export default function AccessProfileSelector({
  value,
  disabled = false,
  onSelect,
}: {
  value: string;
  disabled?: boolean;
  onSelect: (profile: UserAccessProfile | null) => void;
}) {
  const id = useId();
  const [profiles, setProfiles] = useState<UserAccessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const response = await apiFetch("/users/access-profiles", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("profiles");
        const data = (await response.json()) as UserAccessProfile[];
        if (!controller.signal.aborted) setProfiles(data);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  const selected = profiles.find((profile) => profile.id === value);
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="space-y-2">
        <label
          htmlFor={id}
          className="block text-sm font-semibold text-slate-700"
        >
          Perfil por área
        </label>
        <p className="text-xs text-slate-500">
          Preenche cargo, departamento e permissões. Revise e salve para
          aplicar.
        </p>
        <SelectInput
          id={id}
          value={value}
          disabled={disabled || loading || error}
          onChange={(event) =>
            onSelect(
              profiles.find((profile) => profile.id === event.target.value) ??
                null,
            )
          }
        >
          <option value="">
            {loading ? "Carregando perfis..." : "Permissões personalizadas"}
          </option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </SelectInput>
      </div>
      {error ? (
        <InlineMessage tone="warning">
          Não foi possível carregar os perfis.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Tentar novamente
          </button>
        </InlineMessage>
      ) : null}
      {selected ? (
        <div className="space-y-2 text-sm text-slate-600">
          <p>{selected.description}</p>
          <p className="text-xs">
            Modelo inicial; as permissões abaixo podem ser ajustadas para cada
            colaborador.
          </p>
          <button
            type="button"
            disabled={disabled}
            className="font-semibold text-sky-700 disabled:opacity-50"
            onClick={() => onSelect(selected)}
          >
            Restaurar padrão deste perfil
          </button>
        </div>
      ) : null}
    </div>
  );
}
