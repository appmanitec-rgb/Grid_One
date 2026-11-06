import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "../login-experience.module.css";

function ManitecBrand() {
  return (
    <Image
      src="/brand/manitec-logo.png.png"
      alt="Manitec Grupos Geradores"
      width={4112}
      height={1000}
      sizes="(max-width: 1023px) 220px, 260px"
      priority
      className={styles.brandImage}
    />
  );
}

/** Shared presentation for employee sign-in and client access/activation. */
export function AccessFrame({
  audience,
  children,
}: {
  audience: "team" | "client";
  children: ReactNode;
}) {
  const client = audience === "client";
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero} aria-label="Manitec Grupos Geradores">
          <Image
            src="/brand/login-generator-hero-v2.png"
            alt=""
            fill
            loading="eager"
            sizes="(min-width: 1024px) 56vw, 1px"
            className={styles.heroImage}
          />
          <div className={styles.heroShade} />
          <div className={styles.heroHeader}>
            <div className={styles.brandPlate}>
              <ManitecBrand />
            </div>
          </div>
          <div className={styles.heroContent}>
            <span className={styles.heroRule} aria-hidden="true" />
            <p className={styles.eyebrow}>
              {client ? "Portal do cliente" : "Plataforma de gestão Manitec"}
            </p>
            <h2>
              {client ? (
                <>
                  Equipamentos e serviços
                  <br />
                  em um só lugar.
                </>
              ) : (
                <>
                  Gestão comercial
                  <br />e operacional.
                </>
              )}
            </h2>
            <p className={styles.heroDescription}>
              {client
                ? "Acompanhe propostas, equipamentos e chamados da sua empresa."
                : "Propostas, serviços e equipes no mesmo lugar."}
            </p>
            <div
              className={styles.heroAreas}
              aria-label={client ? "Recursos do portal" : "Áreas integradas"}
            >
              {(client
                ? ["Equipamentos", "Propostas", "Chamados", "Documentos"]
                : ["Comercial", "Operação", "Administração"]
              ).map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
        </section>
        <section
          className={styles.panel}
          aria-label={
            client ? "Acesso ao Portal do Cliente" : "Acesso ao GridOne"
          }
        >
          <header className={styles.panelHeader}>
            <div className={styles.mobileBrand}>
              <ManitecBrand />
            </div>
            <span className={styles.accessLabel}>
              {client ? "Acesso do cliente" : "Acesso da equipe"}
            </span>
            <span className={styles.productName}>GridOne</span>
          </header>
          <div className={styles.content}>{children}</div>
          <footer className={styles.footer}>
            <span>© {new Date().getFullYear()} Manitec Grupos Geradores</span>
            {client ? (
              <Link href="/" className={styles.footerLink}>
                Acesso da equipe
              </Link>
            ) : (
              <span>Acesso restrito</span>
            )}
          </footer>
        </section>
      </div>
    </main>
  );
}
