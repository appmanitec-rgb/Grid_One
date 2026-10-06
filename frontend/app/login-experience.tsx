"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";

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

const fieldClass =
  "h-12 w-full rounded-xl border border-[#cbd7e5] bg-white px-4 text-sm text-[#182b45] shadow-sm outline-none transition placeholder:text-[#91a0b2] focus:border-[#2375d8] focus:ring-4 focus:ring-[#2375d8]/10";
const primaryButtonClass =
  "flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#1267c4] px-4 text-sm font-bold text-white shadow-[0_12px_24px_rgba(18,103,196,0.2)] transition hover:bg-[#0d55a4] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#1267c4] disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "w-full rounded-xl border border-[#cbd7e5] bg-white px-4 py-3 text-sm font-semibold text-[#31516f] transition hover:bg-[#eef4fb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1267c4]";

export function LoginExperience({
  email,
  setEmail,
  password,
  setPassword,
  error,
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

  return (
    <main className="min-h-screen bg-[#071326] p-0 font-sans lg:p-4 xl:p-5">
      <div className="mx-auto grid min-h-screen w-full overflow-hidden bg-[#f7f9fc] shadow-[0_28px_80px_rgba(0,0,0,0.25)] lg:min-h-[calc(100vh-2rem)] lg:grid-cols-[minmax(0,1fr)_minmax(450px,520px)] lg:rounded-[26px] xl:min-h-[calc(100vh-2.5rem)]">
        <section
          className="relative isolate flex min-h-[240px] flex-col justify-between overflow-hidden bg-[#0a1d36] p-6 text-white sm:min-h-[300px] sm:p-9 lg:min-h-0 lg:p-12 xl:p-16"
          aria-label="Manitec Grupos Geradores"
        >
          <Image
            src="/brand/login-generator-hero.png"
            alt="Grupo gerador industrial em instalação externa"
            fill
            priority
            sizes="(min-width: 1024px) 60vw, 100vw"
            className="object-cover object-[58%_50%]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,16,34,0.88),rgba(4,16,34,0.3)_70%),linear-gradient(0deg,rgba(4,16,34,0.95),transparent_55%)]" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg font-black text-[#f9b23d] backdrop-blur-sm" aria-hidden="true">M</span>
            <div className="leading-tight">
              <p className="text-sm font-extrabold tracking-[0.17em]">MANITEC</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/65">GridOne · Operação integrada</p>
            </div>
          </div>
          <div className="relative max-w-xl pt-12 lg:pb-5">
            <div className="mb-5 hidden h-px w-14 bg-[#f6a72e] lg:block" />
            <p className="hidden text-[11px] font-bold uppercase tracking-[0.27em] text-[#ffc572] lg:block">Inteligência para quem move energia</p>
            <h2 className="mt-3 max-w-[520px] text-[clamp(1.75rem,3.4vw,3.6rem)] font-bold leading-[1.1] tracking-tight">
              Energia em movimento.<br />
              <span className="text-[#ffc572]">Operação em controle.</span>
            </h2>
            <p className="mt-4 hidden max-w-md text-sm leading-7 text-white/76 lg:block xl:text-base">
              Do primeiro contato à execução, todas as áreas da Manitec conectadas em uma única plataforma.
            </p>
            <div className="mt-8 hidden flex-wrap gap-2 lg:flex">
              {["Comercial", "Operação", "Financeiro"].map((area) => (
                <span key={area} className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/85 backdrop-blur-sm">{area}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-col justify-between bg-[#f9fbfe] px-6 py-8 sm:px-10 lg:px-12 lg:py-10 xl:px-16" aria-label="Acesso ao GridOne">
          <div className="flex justify-end">
            <span className="rounded-full border border-[#dce6f2] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#526a85]">Acesso seguro</span>
          </div>

          <div className="mx-auto w-full max-w-[390px] py-7 lg:py-12">
            <div className="mb-8">
              <Image src="/brand/manitec-logo-transparent.png" alt="Manitec Grupos Geradores" width={230} height={55} className="h-auto w-[205px] object-contain" priority />
              <div className="mt-7 h-1 w-12 rounded-full bg-[#e9a228]" />
              <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.2em] text-[#42617e]">Plataforma GridOne</p>
              <h1 className="mt-2 text-[2rem] font-bold tracking-[-0.035em] text-[#12243d] sm:text-[2.25rem]">
                {flow === "LOGIN" ? "Bem-vindo de volta" : flow === "MFA_CHALLENGE" ? "Confirme seu acesso" : "Proteja sua conta"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#65778e]">
                {flow === "LOGIN" ? "Entre com suas credenciais para continuar seu trabalho." : flow === "MFA_CHALLENGE" ? "Digite o código do seu aplicativo autenticador." : "Configure a verificação em duas etapas para continuar."}
              </p>
            </div>

            {error ? <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}

            {flow === "LOGIN" && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-[#203550]">E-mail</label>
                  <input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} placeholder="seu.email@manitec.com.br" required />
                </div>
                <div>
                  <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-[#203550]">Senha</label>
                  <div className="relative">
                    <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${fieldClass} pr-20`} placeholder="Digite sua senha" required />
                    <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-3 px-2 text-xs font-semibold text-[#476785] hover:text-[#1266bf] focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2375d8]" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? "Ocultar" : "Mostrar"}</button>
                  </div>
                </div>
                <button type="submit" disabled={isLoading} className={primaryButtonClass}>
                  {isLoading ? "Autenticando..." : "Entrar no GridOne"}<span aria-hidden="true">→</span>
                </button>
              </form>
            )}

            {flow === "MFA_CHALLENGE" && (
              <form onSubmit={handleVerifyChallenge} className="space-y-5">
                <div>
                  <label htmlFor="mfa-challenge-code" className="mb-2 block text-sm font-semibold text-[#203550]">Código de verificação</label>
                  <input id="mfa-challenge-code" type="text" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} className={`${fieldClass} font-mono text-lg tracking-[0.22em]`} placeholder="000000" required />
                </div>
                <button type="submit" disabled={isLoading} className={primaryButtonClass}>{isLoading ? "Validando..." : "Validar código"}</button>
                <button type="button" onClick={resetFlow} className={secondaryButtonClass}>Voltar ao login</button>
              </form>
            )}

            {flow === "MFA_SETUP" && (
              <form onSubmit={handleVerifySetup} className="space-y-5">
                {!setupData ? (
                  <button type="button" onClick={() => void loadMfaSetupData()} className={secondaryButtonClass}>Gerar QR Code</button>
                ) : (
                  <div className="rounded-xl border border-[#dce6f2] bg-white p-4 text-center">
                    <Image src={setupData.qrCodeDataUrl} alt="QR Code para configurar autenticação" width={176} height={176} unoptimized className="mx-auto h-44 w-44 rounded-md bg-white p-1" />
                    <p className="mt-2 break-all text-[11px] text-[#667b94]">{setupData.otpAuthUrl}</p>
                  </div>
                )}
                <div>
                  <label htmlFor="mfa-setup-code" className="mb-2 block text-sm font-semibold text-[#203550]">Código do aplicativo</label>
                  <input id="mfa-setup-code" type="text" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} className={`${fieldClass} font-mono text-lg tracking-[0.22em]`} placeholder="000000" required />
                </div>
                <button type="submit" disabled={isLoading} className={primaryButtonClass}>{isLoading ? "Concluindo..." : "Concluir configuração"}</button>
                {recoveryCodes.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-bold text-amber-900">Guarde seus códigos de recuperação em local seguro</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-amber-900">{recoveryCodes.map((code) => <span key={code}>{code}</span>)}</div>
                  </div>
                )}
              </form>
            )}
          </div>

          <div className="mx-auto flex w-full max-w-[390px] flex-wrap items-center justify-between gap-2 border-t border-[#e0e8f1] pt-5 text-[11px] text-[#75879a]">
            <span>© {new Date().getFullYear()} Manitec Grupos Geradores</span>
            <span>Acesso restrito</span>
          </div>
        </section>
      </div>
    </main>
  );
}
