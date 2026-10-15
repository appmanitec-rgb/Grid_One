"use client";

import { useState } from "react";

export default function PortalPasswordEditor({ email, busy, onChangePassword }: {
  email: string;
  busy: boolean;
  onChangePassword: (password: string, confirmation: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  function close() {
    setOpen(false); setPassword(""); setConfirmation(""); setError(""); setVisible(false);
  }

  return <>
    <button type="button" disabled={busy} aria-expanded={open} onClick={() => open ? close() : setOpen(true)} className="rounded border border-blue-200 px-3 py-2 text-xs font-bold text-blue-800">Alterar senha</button>
    {open ? <form aria-label={"Alterar senha de " + email} className="mt-2 w-full space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4" onSubmit={async event => {
      event.preventDefault(); setError("");
      if (password !== confirmation) { setError("A confirmação não corresponde à nova senha."); return; }
      if (new TextEncoder().encode(password).length > 72) { setError("Senha muito longa. Use menos caracteres."); return; }
      try { await onChangePassword(password, confirmation); close(); }
      catch (issue) { setError(issue instanceof Error ? issue.message : "Não foi possível alterar a senha."); }
    }}>
      <div><h4 className="text-sm font-semibold text-slate-900">Nova senha de acesso</h4><p className="mt-1 text-xs text-slate-600">Use pelo menos 12 caracteres. Após a alteração, o usuário deverá entrar novamente.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Nova senha<input autoFocus required minLength={12} maxLength={72} autoComplete="new-password" type={visible ? "text" : "password"} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5" /></label>
        <label className="text-sm font-medium text-slate-700">Confirmar nova senha<input required minLength={12} maxLength={72} autoComplete="new-password" type={visible ? "text" : "password"} value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5" /></label>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={visible} disabled={busy} onChange={event => setVisible(event.target.checked)} />Mostrar senhas</label>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Salvando..." : "Salvar nova senha"}</button><button type="button" disabled={busy} onClick={close} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">Cancelar</button></div>
    </form> : null}
  </>;
}
