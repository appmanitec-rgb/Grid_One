"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { LoginExperience } from "./login-experience";
import { getAccessFromToken, getDefaultDashboardPath } from "@/lib/access";
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
        router.replace(
          payload?.role === "CLIENT"
            ? "/portal"
            : getDefaultDashboardPath(getAccessFromToken()),
        );
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
      router.push(
        data?.user?.role === "CLIENT"
          ? "/portal"
          : getDefaultDashboardPath(getAccessFromToken()),
      );
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
      router.push(
        data?.user?.role === "CLIENT"
          ? "/portal"
          : getDefaultDashboardPath(getAccessFromToken()),
      );
    } catch {
      setError("Falha ao validar MFA.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMfaSetupData() {
    setError("");
    try {
      const token = getStoredAccessToken();
      const res = await apiFetch(apiUrl("/auth/mfa/setup"), {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Não foi possível gerar o QR Code. Tente novamente.");
        return;
      }
      setSetupData(data);
    } catch {
      setError("Não foi possível gerar o QR Code. Verifique a conexão e tente novamente.");
    }
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
      router.push(
        data?.user?.role === "CLIENT"
          ? "/portal"
          : getDefaultDashboardPath(getAccessFromToken()),
      );
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
    <LoginExperience
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      error={error}
      isLoading={isLoading}
      flow={flow}
      mfaCode={mfaCode}
      setMfaCode={setMfaCode}
      setupData={setupData}
      recoveryCodes={recoveryCodes}
      handleLogin={handleLogin}
      handleVerifyChallenge={handleVerifyChallenge}
      handleVerifySetup={handleVerifySetup}
      loadMfaSetupData={loadMfaSetupData}
      resetFlow={resetFlow}
    />
  );
}
