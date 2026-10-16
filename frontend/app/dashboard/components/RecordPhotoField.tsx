"use client";

import { useRef, useState } from "react";
import { preparePhoto } from "../profile/ProfilePhotoField";

export function RecordPhoto({ value, label, className = "" }: {
  value: string;
  label: string;
  className?: string;
}) {
  const [failedPhoto, setFailedPhoto] = useState("");
  return (
    <div className={"flex h-44 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 " + className}>
      {value && failedPhoto !== value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={label} className="h-full w-full object-contain" onError={() => setFailedPhoto(value)} />
      ) : (
        <div className="px-5 text-center text-sm text-slate-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="mx-auto mb-2 h-9 w-9">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8" cy="8" r="1.5" />
            <path d="m3 17 5-5 4 4 4-6 5 7" />
          </svg>
          {value ? "Foto indisponível" : "Nenhuma foto adicionada"}
        </div>
      )}
    </div>
  );
}

export default function RecordPhotoField({ value, label, onChange, canEdit, disabled, onBusyChange }: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  canEdit: boolean;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  async function attach(file?: File) {
    if (!file) return;
    setReading(true);
    onBusyChange(true);
    setError("");
    try {
      onChange(await preparePhoto(file));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Não foi possível anexar a foto.");
    } finally {
      setReading(false);
      onBusyChange(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section aria-label={label} className="mb-5 grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
      <RecordPhoto value={value} label={label} />
      <div className="min-w-0 self-center">
        <h3 className="text-base font-bold text-slate-950">{label}</h3>
        <p className="mt-1 text-sm text-slate-500">A mesma imagem aparece no resumo e na ficha completa.</p>
        {canEdit ? <>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label={"Anexar " + label.toLocaleLowerCase("pt-BR")} disabled={disabled || reading} onChange={event => void attach(event.target.files?.[0])} className="sr-only" />
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" disabled={disabled || reading} onClick={() => input.current?.click()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {reading ? "Preparando foto..." : value ? "Trocar foto" : "Anexar foto"}
            </button>
            {value ? <button type="button" disabled={disabled || reading} onClick={() => { onChange(""); setError(""); }} className="text-sm font-semibold text-red-700 disabled:opacity-50">Remover foto</button> : null}
          </div>
          <p className="mt-2 text-xs text-slate-500">JPG, PNG ou WebP, até 5 MB. Confirme em Salvar alterações.</p>
        </> : null}
        {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}
