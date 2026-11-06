"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";
import { ClientAccessFrame } from "../_components/ClientAccessFrame";
import styles from "../../login-experience.module.css";
import { InterfaceIcon } from "../../dashboard/components/InterfaceIcon";

export default function ActivateClientPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const value =
      new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
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
        throw new Error(
          typeof payload?.message === "string"
            ? payload.message
            : "O link não pôde ser utilizado.",
        );
      }
      window.history.replaceState(null, "", window.location.pathname);
      setComplete(true);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível ativar o acesso.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ClientAccessFrame>
      <div className={styles.intro}>
        <p className={styles.productLabel}>Primeiro acesso</p>
        <h1>{complete ? "Acesso pronto" : "Crie sua senha"}</h1>
        <p className={styles.description}>
          {complete
            ? "Sua conta está ativa. Agora você pode entrar no Portal do Cliente."
            : "Escolha uma senha pessoal para acompanhar os serviços da sua empresa."}
        </p>
      </div>
      {complete ? (
        <Link href="/cliente/entrar" className={styles.primaryButton}>
          Entrar no meu portal
          <InterfaceIcon name="arrow-right" />
        </Link>
      ) : null}
      {!complete && !token ? (
        <div role="alert" className={styles.warning}>
          <p className={styles.helpTitle}>Link de ativação incompleto</p>
          <p>Peça um novo link à equipe Manitec para criar sua senha.</p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {!complete && token ? (
        <form
          onSubmit={submit}
          className={styles.form}
          aria-label="Ativar acesso do cliente"
          aria-busy={loading}
        >
          <div className={styles.fieldGroup}>
            <label htmlFor="new-client-password">Nova senha</label>
            <div className={styles.passwordGroup}>
              <input
                id="new-client-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                required
                className={[styles.field, styles.passwordField].join(" ")}
                placeholder="Pelo menos 12 caracteres"
                aria-describedby="client-password-help"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className={styles.passwordToggle}
                aria-label={showPassword ? "Ocultar senhas" : "Mostrar senhas"}
                aria-pressed={showPassword}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="confirm-client-password">Confirme a senha</label>
            <input
              id="confirm-client-password"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
              className={styles.field}
              placeholder="Repita a senha"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className={styles.primaryButton}
          >
            {loading ? "Ativando..." : "Ativar meu acesso"}
            {!loading ? <InterfaceIcon name="arrow-right" /> : null}
          </button>
          <p id="client-password-help" className={styles.formHelp}>
            Use pelo menos 12 caracteres. O link é de uso único e expira após 48
            horas.
          </p>
        </form>
      ) : null}
    </ClientAccessFrame>
  );
}
