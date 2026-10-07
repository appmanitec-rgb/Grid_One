"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";
import { ClientAccessFrame } from "../_components/ClientAccessFrame";

export default function ActivateClientPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    setToken(value);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 12) {
      setError("Use pelo menos 12 caracteres na senha.");
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch(apiUrl("/auth/client-activate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(typeof payload?.message === "string" ? payload.message : "O link não pôde ser utilizado.");
      }
      window.history.replaceState(null, "", window.location.pathname);
      setComplete(true);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ativar o acesso.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ClientAccessFrame>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Primeiro acesso</p>
      <h2 className="login-display mt-3 text-[2rem] font-bold leading-tight tracking-[-0.04em] text-slate-950">{complete ? "Acesso pronto" : "Crie sua senha"}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{complete ? "Sua conta está ativa. Agora você pode entrar no Portal do Cliente." : "Escolha uma senha pessoal para acompanhar os serviços da sua empresa com segurança."}</p>
      {complete ? <Link href="/cliente/entrar" className="mt-8 flex h-[52px] items-center justify-center rounded-xl bg-[#1267c4] px-4 text-sm font-bold text-white hover:bg-[#0e55a6]">Entrar no meu portal</Link> : null}
      {!complete && !token ? <p role="alert" className="mt-7 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Este link está incompleto. Peça um novo link de ativação à equipe Manitec.</p> : null}
      {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
      {!complete && token ? (
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div><label htmlFor="new-client-password" className="mb-2 block text-sm font-semibold">Nova senha</label><div className="relative"><input id="new-client-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={12} required className="h-[52px] w-full rounded-xl border border-slate-300 px-4 pr-24 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="Pelo menos 12 caracteres" /><button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute inset-y-0 right-3 px-2 text-xs font-bold text-blue-700">{showPassword ? "Ocultar" : "Mostrar"}</button></div></div>
          <div><label htmlFor="confirm-client-password" className="mb-2 block text-sm font-semibold">Confirme a senha</label><input id="confirm-client-password" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} required className="h-[52px] w-full rounded-xl border border-slate-300 px-4 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="Repita a senha" /></div>
          <button type="submit" disabled={loading} className="flex h-[52px] w-full items-center justify-center rounded-xl bg-[#1267c4] px-4 text-sm font-bold text-white hover:bg-[#0e55a6] disabled:opacity-60">{loading ? "Ativando..." : "Ativar meu acesso"}</button>
          <p className="text-xs leading-5 text-slate-500">O link é de uso único e expira após 48 horas.</p>
        </form>
      ) : null}
    </ClientAccessFrame>
  );
}
