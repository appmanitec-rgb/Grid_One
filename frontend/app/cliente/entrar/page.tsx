"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";
import {
  clearAuthSession,
  decodeJwtPayload,
  ensureValidSession,
  getDeviceName,
  getOrCreateDeviceId,
  getStoredAccessToken,
  persistAuthenticatedSession,
} from "@/lib/auth-session";
import { ClientAccessFrame } from "../_components/ClientAccessFrame";

const fieldClass = "h-[52px] w-full rounded-xl border border-slate-300 bg-white px-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100";

export default function ClientLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void ensureValidSession().then((valid) => {
      if (!valid || cancelled) return;
      const token = getStoredAccessToken();
      const payload = token ? decodeJwtPayload<{ role?: string }>(token) : null;
      router.replace(payload?.role === "CLIENT" ? "/portal/dashboard" : "/dashboard");
    });
    return () => { cancelled = true; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(apiUrl(challengeToken ? "/auth/mfa/verify" : "/auth/client-login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(challengeToken
          ? { challengeToken, code: code.trim(), deviceId: getOrCreateDeviceId(), deviceName: getDeviceName() }
          : { email, password, deviceId: getOrCreateDeviceId(), deviceName: getDeviceName() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data?.message === "string" ? data.message : "Não foi possível entrar. Confira seus dados.");
        return;
      }
      if (data?.mfa_required && data?.challengeToken) {
        clearAuthSession();
        setChallengeToken(data.challengeToken);
        return;
      }
      if (data?.user?.role !== "CLIENT" || !data?.access_token) {
        setError("Esta conta não está vinculada a um cliente. Use o acesso da equipe.");
        return;
      }
      persistAuthenticatedSession(data);
      router.replace("/portal/dashboard");
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ClientAccessFrame>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Acesso do cliente</p>
      <h2 className="login-display mt-3 text-[2rem] font-bold leading-tight tracking-[-0.04em] text-slate-950">{challengeToken ? "Confirme seu acesso" : "Bem-vindo ao seu portal"}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{challengeToken ? "Informe o código do aplicativo autenticador." : "Entre com o e-mail e a senha do acesso vinculado à sua empresa."}</p>

      {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}

      <form onSubmit={submit} className="mt-8 space-y-5">
        {challengeToken ? (
          <div><label htmlFor="client-code" className="mb-2 block text-sm font-semibold">Código de verificação</label><input id="client-code" value={code} onChange={(event) => setCode(event.target.value)} className={fieldClass} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" required /></div>
        ) : (
          <>
            <div><label htmlFor="client-email" className="mb-2 block text-sm font-semibold">E-mail</label><input id="client-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClass} autoComplete="username" placeholder="seu.email@empresa.com.br" required /></div>
            <div><label htmlFor="client-password" className="mb-2 block text-sm font-semibold">Senha</label><div className="relative"><input id="client-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className={`${fieldClass} pr-24`} autoComplete="current-password" placeholder="Sua senha" required /><button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute inset-y-0 right-3 px-2 text-xs font-bold text-blue-700">{showPassword ? "Ocultar" : "Mostrar"}</button></div></div>
          </>
        )}
        <button type="submit" disabled={loading} className="flex h-[52px] w-full items-center justify-center rounded-xl bg-[#1267c4] px-4 text-sm font-bold text-white shadow-[0_12px_24px_rgba(18,103,196,0.2)] transition hover:bg-[#0e55a6] disabled:opacity-60">{loading ? "Aguarde..." : challengeToken ? "Confirmar código" : "Entrar no portal"}</button>
      </form>
      {challengeToken ? <button type="button" onClick={() => { setChallengeToken(""); setCode(""); setError(""); }} className="mt-4 text-sm font-semibold text-blue-700 hover:text-blue-900">Voltar para e-mail e senha</button> : <p className="mt-7 text-center text-sm text-slate-600">Primeiro acesso? Solicite à Manitec o seu link de ativação.</p>}
      <p className="mt-4 text-center text-xs text-slate-500">Para comprar peças ou contratar serviços, envie uma solicitação pelo portal após entrar.</p>
    </ClientAccessFrame>
  );
}
