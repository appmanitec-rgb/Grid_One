"use client";

import Image from "next/image";
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
  persistPendingAccessToken,
} from "@/lib/auth-session";

type MfaSetupData = {
  issuer: string;
  otpAuthUrl: string;
  qrCodeDataUrl: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [flow, setFlow] = useState<"LOGIN" | "MFA_CHALLENGE" | "MFA_SETUP">("LOGIN");
  const [mfaCode, setMfaCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function resumeSession() {
      const hasSession = await ensureValidSession();
      if (!cancelled && hasSession) {
        const token = getStoredAccessToken();
        const payload = token ? decodeJwtPayload<{ role?: string }>(token) : null;
        router.replace(payload?.role === "CLIENT" ? "/portal" : "/dashboard");
      }
    }

    void resumeSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const deviceId = getOrCreateDeviceId();
      const res = await apiFetch(apiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          deviceId,
          deviceName: getDeviceName(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Credenciais invalidas.");
        return;
      }

      if (data?.mfa_required) {
        clearAuthSession();
        setFlow("MFA_CHALLENGE");
        setChallengeToken(data.challengeToken || "");
        return;
      }

      if (data?.mfa_setup_required) {
        persistPendingAccessToken(data.access_token || "");
        setFlow("MFA_SETUP");
        await loadMfaSetupData();
        return;
      }

      persistAuthenticatedSession(data);
      router.push(data?.user?.role === "CLIENT" ? "/portal" : "/dashboard");
    } catch {
      setError("Erro de conexao com o servidor. Verifique se o backend esta ativo.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyChallenge(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const deviceId = getOrCreateDeviceId();
      const res = await apiFetch(apiUrl("/auth/mfa/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeToken,
          code: mfaCode.trim(),
          deviceId,
          deviceName: getDeviceName(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Codigo MFA invalido.");
        return;
      }

      persistAuthenticatedSession(data);
      router.push(data?.user?.role === "CLIENT" ? "/portal" : "/dashboard");
    } catch {
      setError("Falha ao validar MFA.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMfaSetupData() {
    setError("");
    const token = getStoredAccessToken();

    const res = await apiFetch(apiUrl("/auth/mfa/setup"), {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.message || "Falha ao iniciar setup MFA.");
    }
    setSetupData(data);
  }

  async function handleVerifySetup(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const token = getStoredAccessToken();
      const deviceId = getOrCreateDeviceId();
      const res = await apiFetch(apiUrl("/auth/mfa/verify-setup"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          code: mfaCode.trim(),
          deviceId,
          deviceName: getDeviceName(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Codigo MFA invalido.");
        return;
      }

      if (Array.isArray(data?.recoveryCodes)) {
        setRecoveryCodes(data.recoveryCodes);
      }
      persistAuthenticatedSession(data);
      router.push(data?.user?.role === "CLIENT" ? "/portal" : "/dashboard");
    } catch {
      setError("Falha ao concluir setup MFA.");
    } finally {
      setIsLoading(false);
    }
  }

  function resetFlow() {
    setFlow("LOGIN");
    setMfaCode("");
    setChallengeToken("");
    setSetupData(null);
    setRecoveryCodes([]);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#e9f1fb] via-[#f7faff] to-[#eef4fb] p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
            <Image
              src="/brand/manitec-logo-transparent.png"
              alt="Manitec Grupos Geradores"
              width={300}
              height={70}
              className="h-16 w-auto object-contain"
              priority
            />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-800">Manitec GridOne</h1>
          <p className="mt-1 text-sm font-medium text-zinc-500">Plataforma comercial e operacional</p>
        </div>

        {error ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {flow === "LOGIN" && (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="mb-1 block text-sm font-semibold text-zinc-700">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 p-3 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-200"
                placeholder="contato@manitec.com.br"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-zinc-700">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 p-3 font-mono outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-200"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Autenticando..." : "Entrar no Sistema"}
            </button>
          </form>
        )}

        {flow === "MFA_CHALLENGE" && (
          <form onSubmit={handleVerifyChallenge} className="space-y-4">
            <p className="text-sm text-zinc-600">MFA habilitado. Informe o codigo do app autenticador.</p>
            <input
              type="text"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 p-3 font-mono tracking-widest outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-200"
              placeholder="123456"
              required
            />
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Validando..." : "Validar MFA"}
            </button>
            <button
              type="button"
              onClick={resetFlow}
              className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
            >
              Voltar ao login
            </button>
          </form>
        )}

        {flow === "MFA_SETUP" && (
          <form onSubmit={handleVerifySetup} className="space-y-4">
            <p className="text-sm text-zinc-600">Seu perfil interno exige configuracao obrigatoria de MFA.</p>
            {!setupData ? (
              <button
                type="button"
                onClick={() => void loadMfaSetupData()}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
              >
                Gerar QR Code
              </button>
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-center">
                <Image
                  src={setupData.qrCodeDataUrl}
                  alt="QR Code MFA"
                  width={176}
                  height={176}
                  unoptimized
                  className="mx-auto h-44 w-44 rounded-md border border-zinc-200 bg-white p-1"
                />
                <p className="mt-2 break-all text-[11px] text-zinc-500">{setupData.otpAuthUrl}</p>
              </div>
            )}

            <input
              type="text"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 p-3 font-mono tracking-widest outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-200"
              placeholder="123456"
              required
            />

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Concluindo..." : "Concluir setup MFA"}
            </button>

            {recoveryCodes.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-800">Codigos de recuperacao</p>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs font-mono text-amber-900">
                  {recoveryCodes.map((code) => (
                    <span key={code}>{code}</span>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
