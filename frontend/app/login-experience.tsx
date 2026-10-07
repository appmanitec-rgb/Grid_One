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
  "h-[52px] w-full rounded-xl border border-[#c5d3e3] bg-white px-4 text-[15px] text-[#182b45] shadow-sm outline-none transition placeholder:text-[#72849a] focus:border-[#2375d8] focus:ring-4 focus:ring-[#2375d8]/10";
const primaryButtonClass =
  "flex h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-[#1267c4] px-4 text-[15px] font-bold text-white shadow-[0_12px_24px_rgba(18,103,196,0.2)] transition hover:bg-[#0d55a4] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#1267c4] disabled:cursor-not-allowed disabled:opacity-60";
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
    <main className="login-experience min-h-screen bg-[#071326] p-0 lg:p-4 xl:p-5">
      <div className="mx-auto grid min-h-screen w-full overflow-hidden bg-[#f7f9fc] shadow-[0_28px_80px_rgba(0,0,0,0.25)] lg:min-h-[calc(100vh-2rem)] lg:grid-cols-[minmax(0,1fr)_minmax(450px,520px)] lg:rounded-[26px] xl:min-h-[calc(100vh-2.5rem)]">
        <section
          className="relative isolate flex min-h-[265px] flex-col justify-between overflow-hidden bg-[#0a1d36] px-6 py-7 text-white sm:min-h-[320px] sm:p-9 lg:min-h-0 lg:p-12 xl:p-16"
          aria-label="Manitec Grupos Geradores"
        >
          <Image
            src="/brand/login-generator-hero.png"
            alt="Grupo gerador industrial da Manitec"
            fill
            priority
            sizes="(min-width: 1024px) 60vw, 100vw"
            className="object-cover object-[58%_50%]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,16,34,0.91),rgba(4,16,34,0.28)_74%),linear-gradient(0deg,rgba(4,16,34,0.94),transparent_65%)]" />
          <div className="relative flex justify-center lg:justify-start">
            <Image src="/brand/manitec-gridone-lockup.svg" alt="Manitec Grupos Geradores · GridOne" width={370} height={86} priority className="h-auto w-[250px] sm:w-[300px] lg:w-[320px]" />
          </div>
          <div className="relative max-w-xl pt-8 lg:pb-5">
            <div className="mb-5 hidden h-px w-14 bg-[#f6a72e] lg:block" />
            <p className="hidden text-xs font-bold uppercase tracking-[0.2em] text-[#ffc572] lg:block">Gestão para quem move energia</p>
            <h2 className="login-display max-w-[590px] text-[clamp(1.8rem,3.4vw,3.5rem)] font-bold leading-[1.1] tracking-[-0.045em] lg:mt-4">
              Energia em operação.<br />
              <span className="text-[#ffc572]">Toda a gestão em sintonia.</span>
            </h2>
            <p className="mt-4 hidden max-w-md text-[15px] leading-7 text-white/85 lg:block">
              Do primeiro contato à entrega, conecte equipes, informações e decisões em um só lugar.
            </p>
            <div className="mt-8 hidden flex-wrap items-center gap-3 text-xs font-semibold text-white/80 lg:flex">
              <span>Comercial</span><span className="size-1 rounded-full bg-[#ffc572]" /><span>Operação</span><span className="size-1 rounded-full bg-[#ffc572]" /><span>Financeiro</span>
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-col justify-between bg-[#f9fbfe] px-6 py-8 sm:px-10 lg:px-12 lg:py-10 xl:px-16" aria-label="Acesso ao GridOne">
          <div className="flex justify-end">
            <span className="rounded-full border border-[#dce6f2] bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#526a85]">Acesso seguro</span>
          </div>

          <div className="mx-auto w-full max-w-[390px] py-7 lg:py-10">
            <div className="mb-8 text-center">
              <Image src="/brand/manitec-logo-transparent.png" alt="Manitec Grupos Geradores" width={290} height={68} className="mx-auto h-auto w-[240px] object-contain sm:w-[270px]" priority />
              <div className="mx-auto mt-6 h-1 w-12 rounded-full bg-[#e9a228]" />
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-[#42617e]">Manitec GridOne</p>
              <h1 className="login-display mt-2 text-[2rem] font-bold tracking-[-0.04em] text-[#12243d] sm:text-[2.3rem]">
                {flow === "LOGIN" ? "Bem-vindo ao GridOne" : flow === "MFA_CHALLENGE" ? "Confirme seu acesso" : "Proteja sua conta"}
              </h1>
              <p className="mx-auto mt-2 max-w-[340px] text-sm leading-6 text-[#536981]">
                {flow === "LOGIN" ? "Entre para acompanhar propostas, equipes e operações da Manitec." : flow === "MFA_CHALLENGE" ? "Digite o código gerado pelo seu aplicativo autenticador." : "Ative a verificação em duas etapas para proteger seu acesso."}
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
                  {isLoading ? "Entrando..." : "Acessar o GridOne"}<span aria-hidden="true">→</span>
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
