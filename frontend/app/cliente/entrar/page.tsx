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
import styles from "../../login-experience.module.css";
import { InterfaceIcon } from "../../dashboard/components/InterfaceIcon";

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
      router.replace(
        payload?.role === "CLIENT" ? "/portal/dashboard" : "/dashboard",
      );
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(
        apiUrl(challengeToken ? "/auth/mfa/verify" : "/auth/client-login"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            challengeToken
              ? {
                  challengeToken,
                  code: code.trim(),
                  deviceId: getOrCreateDeviceId(),
                  deviceName: getDeviceName(),
                }
              : {
                  email,
                  password,
                  deviceId: getOrCreateDeviceId(),
                  deviceName: getDeviceName(),
                },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setError(
          typeof data?.message === "string"
            ? data.message
            : "Não foi possível entrar. Confira seus dados.",
        );
        return;
      }
      if (data?.mfa_required && data?.challengeToken) {
        clearAuthSession();
        setChallengeToken(data.challengeToken);
        return;
      }
      if (data?.user?.role !== "CLIENT" || !data?.access_token) {
        setError(
          "Esta conta não está vinculada a um cliente. Use o acesso da equipe.",
        );
        return;
      }
      persistAuthenticatedSession(data);
      router.replace("/portal/dashboard");
    } catch {
      setError(
        "Não foi possível conectar ao servidor. Tente novamente em instantes.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ClientAccessFrame>
      <div className={styles.intro}>
        <p className={styles.productLabel}>Portal do cliente</p>
        <h1>
          {challengeToken ? "Confirme seu acesso" : "Bem-vindo ao seu portal"}
        </h1>
        <p className={styles.description}>
          {challengeToken
            ? "Informe o código do aplicativo autenticador."
            : "Entre com o e-mail e a senha vinculados à sua empresa."}
        </p>
      </div>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <form
        onSubmit={submit}
        className={styles.form}
        aria-label="Entrar no Portal do Cliente"
        aria-busy={loading}
      >
        {challengeToken ? (
          <div className={styles.fieldGroup}>
            <label htmlFor="client-code">Código de verificação</label>
            <input
              id="client-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className={[styles.field, styles.codeField].join(" ")}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              required
            />
          </div>
        ) : (
          <>
            <div className={styles.fieldGroup}>
              <label htmlFor="client-email">E-mail</label>
              <input
                id="client-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={styles.field}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="seu.email@empresa.com.br"
                required
              />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="client-password">Senha</label>
              <div className={styles.passwordGroup}>
                <input
                  id="client-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={[styles.field, styles.passwordField].join(" ")}
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className={styles.passwordToggle}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>
          </>
        )}
        <button
          type="submit"
          disabled={loading}
          className={styles.primaryButton}
        >
          {loading
            ? "Aguarde..."
            : challengeToken
              ? "Confirmar código"
              : "Entrar no portal"}
          {!loading ? <InterfaceIcon name="arrow-right" /> : null}
        </button>
      </form>
      {challengeToken ? (
        <button
          type="button"
          onClick={() => {
            setChallengeToken("");
            setCode("");
            setError("");
          }}
          className={[styles.secondaryButton, styles.backButton].join(" ")}
        >
          Voltar para e-mail e senha
        </button>
      ) : (
        <div className={styles.accessHelp}>
          <p className={styles.helpTitle}>Primeiro acesso?</p>
          <p>
            Solicite à equipe Manitec o link de ativação do acesso da sua
            empresa.
          </p>
          <p>Após entrar, você pode solicitar peças e serviços pelo portal.</p>
        </div>
      )}
    </ClientAccessFrame>
  );
}
