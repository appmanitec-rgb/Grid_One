"use client";
import { useEffect, useState } from "react";
import {
  decodeJwtPayload,
  getStoredAccessToken,
  refreshAccessSession,
} from "@/lib/auth-session";
import {
  commercialFetch,
  commercialPost,
  ManagementRights,
  Portfolio,
  PORTFOLIO_LABELS,
} from "@/lib/commercial-workspace";
const labels: Record<keyof ManagementRights, string> = {
  team: "Acompanhar equipe e indicadores",
  costs: "Consultar e conferir custos",
  margins: "Consultar margem estimada",
  templates: "Editar modelos",
  publishTemplates: "Publicar modelos",
};
type Configuration = {
  name: string;
  portfolios: Portfolio[];
  grants: Partial<
    Record<Portfolio, Partial<ManagementRights & { responsible: boolean }>>
  >;
  expectedHash: string;
};
export default function CommercialResponsibilities({
  userId,
  disabled,
}: {
  userId: string;
  disabled: boolean;
}) {
  const [configuration, setConfiguration] = useState<Configuration>();
  const [original, setOriginal] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (disabled) return;
    const controller = new AbortController();
    setConfiguration(undefined);
    setError("");
    commercialFetch<Configuration>(`/responsibilities/${userId}`, {
      signal: controller.signal,
    })
      .then((value) => {
        setConfiguration(value);
        setOriginal(JSON.stringify(value.grants));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [userId, disabled, attempt]);
  return (
    <section className="my-5 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold">Administração responsável do Comercial</h3>
      <p className="mt-2 text-sm text-slate-600">
        Liberação explícita por usuário e carteira. A designação não transforma
        o colaborador em ADMIN geral nem libera outros departamentos. Custos e
        indicadores exigem a carteira atribuída no perfil e as opções abaixo. A
        conta master também depende de designação explícita.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}{" "}
          <button
            className="underline"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Recarregar
          </button>
        </p>
      ) : null}
      {!configuration && !error && !disabled ? (
        <p role="status" className="mt-3 text-sm">
          Carregando responsabilidades…
        </p>
      ) : null}
      <fieldset
        disabled={disabled || busy || !configuration}
        className="mt-4 grid gap-3 disabled:opacity-60 md:grid-cols-3"
      >
        {Object.entries(PORTFOLIO_LABELS).map(([portfolio, title]) => (
          <section
            className="rounded-lg border border-slate-200 p-3"
            key={portfolio}
          >
            <h4 className="mb-3 font-medium">{title}</h4>
            <label className="mb-3 flex items-start gap-2 text-sm font-medium">
              <input
                type="checkbox"
                disabled={
                  !configuration?.portfolios.includes(portfolio as Portfolio) &&
                  !configuration?.grants[portfolio as Portfolio]?.responsible
                }
                checked={
                  configuration?.grants[portfolio as Portfolio]?.responsible ===
                  true
                }
                onChange={(event) => {
                  if (!configuration) return;
                  setConfiguration({
                    ...configuration,
                    grants: {
                      ...configuration.grants,
                      [portfolio]: event.target.checked
                        ? { responsible: true }
                        : { responsible: false },
                    },
                  });
                  setNotice("");
                }}
              />
              Responsável por esta carteira
            </label>
            {configuration &&
            !configuration.portfolios.includes(portfolio as Portfolio) ? (
              <p className="mb-3 text-xs text-slate-500">
                Atribua a carteira no perfil para liberar a designação.
              </p>
            ) : null}
            {Object.entries(labels).map(([action, label]) => (
              <label
                className="mb-2 flex items-start gap-2 text-sm"
                key={action}
              >
                <input
                  type="checkbox"
                  disabled={
                    !configuration?.grants[portfolio as Portfolio]?.responsible
                  }
                  checked={
                    configuration?.grants[portfolio as Portfolio]?.[
                      action as keyof ManagementRights
                    ] === true
                  }
                  onChange={(event) => {
                    if (!configuration) return;
                    setConfiguration({
                      ...configuration,
                      grants: {
                        ...configuration.grants,
                        [portfolio]: {
                          ...configuration.grants[portfolio as Portfolio],
                          [action]: event.target.checked,
                        },
                      },
                    });
                    setNotice("");
                  }}
                />
                {label}
              </label>
            ))}
          </section>
        ))}
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="app-button app-button-primary"
          disabled={
            disabled ||
            busy ||
            !configuration ||
            JSON.stringify(configuration.grants) === original
          }
          onClick={async () => {
            if (!configuration) return;
            setBusy(true);
            setError("");
            try {
              const value = await commercialPost<Configuration>(
                `/responsibilities/${userId}`,
                {
                  grants: configuration.grants,
                  expectedHash: configuration.expectedHash,
                },
              );
              setConfiguration(value);
              setOriginal(JSON.stringify(value.grants));
              if (
                decodeJwtPayload<{ sub?: string }>(getStoredAccessToken() || "")
                  ?.sub === userId
              )
                await refreshAccessSession();
              setNotice(
                "Responsabilidades salvas. A API aplica as novas liberações nas próximas consultas.",
              );
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Falha ao salvar.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Salvando…" : "Salvar responsabilidades comerciais"}
        </button>
        {notice ? (
          <p role="status" className="text-sm text-emerald-700">
            {notice}
          </p>
        ) : null}
      </div>
    </section>
  );
}
