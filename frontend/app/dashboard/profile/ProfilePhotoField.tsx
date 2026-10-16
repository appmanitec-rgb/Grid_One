"use client";

import { useRef, useState } from "react";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PHOTO_BYTES = 256000;

export async function preparePhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Escolha uma foto JPG, PNG ou WebP.");
  }
  if (file.size > MAX_FILE_BYTES) throw new Error("A foto deve ter até 5 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const photo = new Image();
      photo.onload = () => resolve(photo);
      photo.onerror = () => reject(new Error("Não foi possível abrir essa imagem. Escolha outro arquivo."));
      photo.src = objectUrl;
    });
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.88, 0.76, 0.6]) {
      const dataUrl = canvas.toDataURL("image/webp", quality);
      if ((dataUrl.split(",")[1]?.length || 0) * 0.75 <= MAX_PHOTO_BYTES) return dataUrl;
    }
    throw new Error("Não foi possível reduzir a foto. Escolha uma imagem menor.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function ProfilePhotoField({ value, onChange, initials, disabled, onBusyChange }: {
  value: string;
  onChange: (value: string) => void;
  initials: string;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  async function attach(file?: File) {
    if (!file) return;
    setError("");
    setReading(true);
    onBusyChange(true);
    try {
      onChange(await preparePhoto(file));
      setFileName(file.name);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Não foi possível anexar a foto.");
    } finally {
      setReading(false);
      onBusyChange(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section aria-label="Foto do perfil" className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
      <h3 className="text-sm font-semibold text-slate-800">Foto do perfil</h3>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 text-xl font-bold text-white">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Prévia da foto do perfil" className="h-full w-full object-cover" />
          ) : initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-600">Anexe uma foto do computador ou celular.</p>
          <p className="mt-1 text-xs text-slate-500">JPG, PNG ou WebP, até 5 MB. A foto será salva ao clicar em Salvar perfil.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Anexar foto do perfil" disabled={disabled || reading} onChange={event => void attach(event.target.files?.[0])} className="sr-only" />
            <button type="button" disabled={disabled || reading} onClick={() => input.current?.click()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50">
              {reading ? "Preparando foto..." : value ? "Trocar foto" : "Anexar foto"}
            </button>
            {value ? <button type="button" disabled={disabled || reading} onClick={() => { onChange(""); setFileName(""); setError(""); }} className="text-sm font-semibold text-red-700 disabled:opacity-50">Remover foto</button> : null}
          </div>
          {fileName && value.startsWith("data:") ? <p className="mt-2 break-all text-xs text-slate-500">{fileName}</p> : null}
        </div>
      </div>
      <details className="mt-4 text-sm text-slate-600">
        <summary className="cursor-pointer">Usar um link de imagem</summary>
        <label className="mt-2 block text-sm font-medium text-slate-700">
          Link da foto
          <input type="url" value={value.startsWith("data:") ? "" : value} disabled={disabled || reading} onChange={event => { onChange(event.target.value); setFileName(""); setError(""); }} placeholder="https://..." className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" />
        </label>
      </details>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
