import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function ClientAccessFrame({ children }: { children: ReactNode }) {
  return (
    <main className="login-experience min-h-screen bg-[#eaf2f9] px-4 py-5 text-[#142a44] sm:px-6 lg:flex lg:items-center lg:py-8">
      <div className="mx-auto grid w-full max-w-[1250px] overflow-hidden rounded-[28px] bg-white shadow-[0_30px_80px_-35px_rgba(15,48,83,0.35)] lg:min-h-[690px] lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
        <section className="relative isolate flex min-h-[260px] flex-col justify-between overflow-hidden bg-[#0c3155] px-7 py-8 text-white sm:min-h-[310px] sm:px-10 lg:min-h-full lg:p-14">
          <Image src="/brand/login-generator-hero-v2.png" alt="Grupo gerador em operação" fill priority sizes="(min-width: 1024px) 55vw, 100vw" quality={90} className="object-cover object-[58%_50%]" />
          <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(5,31,56,0.78),rgba(4,28,53,0.26)),linear-gradient(0deg,rgba(5,31,56,0.86),transparent_65%)]" />
          <Image src="/brand/manitec-gridone-lockup.svg" alt="Manitec GridOne" width={370} height={86} className="relative h-auto w-[230px] sm:w-[275px]" />
          <div className="relative mt-12 max-w-[540px]">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffcb79]">Portal do cliente</p>
            <h1 className="login-display mt-3 text-3xl font-bold leading-tight tracking-[-0.04em] sm:text-4xl lg:text-[2.75rem]">Tudo sobre a sua energia, em um só lugar.</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/85 sm:text-base sm:leading-7">Acompanhe seus geradores, avalie propostas e solicite peças ou serviços com a equipe Manitec.</p>
            <div className="mt-7 hidden flex-wrap gap-2 lg:flex">
              {['Propostas', 'Equipamentos', 'Chamados', 'Documentos'].map((item) => <span key={item} className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm">{item}</span>)}
            </div>
          </div>
        </section>
        <section className="flex flex-col justify-between px-6 py-8 sm:px-10 lg:px-14 lg:py-10">
          <div className="flex justify-end"><span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">Área exclusiva do cliente</span></div>
          <div className="mx-auto w-full max-w-[390px] py-8">{children}</div>
          <div className="mx-auto flex w-full max-w-[390px] justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500">
            <span>© {new Date().getFullYear()} Manitec</span>
            <Link href="/" className="font-semibold text-blue-700 hover:text-blue-900">Acesso da equipe</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
