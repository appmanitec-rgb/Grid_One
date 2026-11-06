"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { InterfaceIcon } from "./dashboard/components/InterfaceIcon";
import styles from "./login-experience.module.css";
import { AccessFrame } from "./_components/AccessFrame";

type MfaSetupData = {
  issuer: string;
  otpAuthUrl: string;
  qrCodeDataUrl: string;
};

type LoginExperienceProps = {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  error: string;
  notice?: string;
  isLoading: boolean;
  flow: "LOGIN" | "MFA_CHALLENGE" | "MFA_SETUP";
  mfaCode: string;
  setMfaCode: (value: string) => void;
  setupData: MfaSetupData | null;
  recoveryCodes: string[];
  handleLogin: (event: FormEvent) => void;
  handleVerifyChallenge: (event: FormEvent) => void;
  handleVerifySetup: (event: FormEvent) => void;
  loadMfaSetupData: () => Promise<void>;
  resetFlow: () => void;
};

export function LoginExperience({
  email,
  setEmail,
  password,
  setPassword,
  error,
  notice,
  isLoading,
  flow,
  mfaCode,
  setMfaCode,
  setupData,
  recoveryCodes,
  handleLogin,
  handleVerifyChallenge,
  handleVerifySetup,
  loadMfaSetupData,
  resetFlow,
}: LoginExperienceProps) {
  const [showPassword, setShowPassword] = useState(false);
  const title =
    flow === "LOGIN"
      ? "Acesse sua conta"
      : flow === "MFA_CHALLENGE"
        ? "Confirme seu acesso"
        : "Proteja sua conta";
  const description =
    flow === "LOGIN"
      ? "Entre com seu e-mail e senha para continuar."
      : flow === "MFA_CHALLENGE"
        ? "Informe o código do seu aplicativo autenticador."
        : "Configure a verificação em duas etapas para continuar.";

  return (
    <AccessFrame audience="team">
      <div className={styles.intro}>
        <p className={styles.productLabel}>Manitec GridOne</p>
        <h1>{title}</h1>
        <p className={styles.description}>{description}</p>
      </div>

      {notice ? (
        <div role="status" className={styles.notice}>
          {notice}
        </div>
      ) : null}
      {error ? (
        <div role="alert" id="login-feedback" className={styles.error}>
          {error}
        </div>
      ) : null}

      {flow === "LOGIN" && (
        <form
          onSubmit={handleLogin}
          className={styles.form}
          aria-label="Entrar no GridOne"
          aria-busy={isLoading}
        >
          <div className={styles.fieldGroup}>
            <label htmlFor="login-email">E-mail</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={styles.field}
              placeholder="seu.email@manitec.com.br"
              required
            />
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="login-password">Senha</label>
            <div className={styles.passwordGroup}>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${styles.field} ${styles.passwordField}`}
                placeholder="Digite sua senha"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className={styles.passwordToggle}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className={styles.primaryButton}
          >
            {isLoading ? "Entrando..." : "Acessar o GridOne"}
            {!isLoading ? <InterfaceIcon name="arrow-right" /> : null}
          </button>
        </form>
      )}

      {flow === "LOGIN" ? (
        <div className={styles.clientAccess}>
          <p>É cliente da Manitec?</p>
          <Link href="/cliente/entrar" className={styles.clientLink}>
            Acessar portal do cliente
            <InterfaceIcon name="arrow-right" />
          </Link>
        </div>
      ) : null}

      {flow === "MFA_CHALLENGE" && (
        <form
          onSubmit={handleVerifyChallenge}
          className={styles.form}
          aria-label="Verificar acesso"
          aria-busy={isLoading}
        >
          <div className={styles.fieldGroup}>
            <label htmlFor="mfa-challenge-code">Código de verificação</label>
            <input
              id="mfa-challenge-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
              className={`${styles.field} ${styles.codeField}`}
              placeholder="000000"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className={styles.primaryButton}
          >
            {isLoading ? "Validando..." : "Validar código"}
          </button>
          <button
            type="button"
            onClick={resetFlow}
            className={styles.secondaryButton}
          >
            Voltar ao login
          </button>
        </form>
      )}

      {flow === "MFA_SETUP" && (
        <form
          onSubmit={handleVerifySetup}
          className={styles.form}
          aria-label="Configurar verificação em duas etapas"
          aria-busy={isLoading}
        >
          {!setupData ? (
            <button
              type="button"
              onClick={() => void loadMfaSetupData()}
              className={styles.secondaryButton}
            >
              Gerar QR Code
            </button>
          ) : (
            <div className={styles.qrPanel}>
              <Image
                src={setupData.qrCodeDataUrl}
                alt="QR Code para configurar autenticação"
                width={176}
                height={176}
                unoptimized
                className={styles.qrImage}
              />
              <p className={styles.qrHelp}>
                Leia com seu aplicativo autenticador.
              </p>
              <p className={styles.setupAddress}>{setupData.otpAuthUrl}</p>
            </div>
          )}
          <div className={styles.fieldGroup}>
            <label htmlFor="mfa-setup-code">Código do aplicativo</label>
            <input
              id="mfa-setup-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
              className={`${styles.field} ${styles.codeField}`}
              placeholder="000000"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className={styles.primaryButton}
          >
            {isLoading ? "Concluindo..." : "Concluir configuração"}
          </button>
          {recoveryCodes.length > 0 && (
            <div className={styles.recoveryPanel}>
              <p>Guarde seus códigos de recuperação em local seguro.</p>
              <div className={styles.recoveryCodes}>
                {recoveryCodes.map((code) => (
                  <span key={code}>{code}</span>
                ))}
              </div>
            </div>
          )}
        </form>
      )}
    </AccessFrame>
  );
}
