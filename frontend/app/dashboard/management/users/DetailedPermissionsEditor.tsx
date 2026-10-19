"use client";
import { useState } from "react";
import type { AccessPolicy } from "@/lib/access";
import { ACCESS_SCREENS, ACCESS_ACTION_LABELS } from "@/lib/access-screens";
import { DetailedAccessRules, emptyRules } from "@/lib/access-rules";

const portfolioLabels = {
  generators: "Geradores",
  partsServices: "Peças e serviços",
  contracts: "Contratos",
};
const typeLabels: Record<string, string> = {
  PREVENTIVE: "Preventiva",
  CORRECTIVE: "Corretiva",
  EMERGENCY: "Atendimento emergencial",
  INSTALLATION: "Instalação",
  DEMOBILIZATION: "Desmobilização",
  REFUELING: "Abastecimento",
};
function localDate(value: string) {
  return value
    ? new Date(value)
        .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
        .slice(0, 16)
        .replace(" ", "T")
    : "";
}
export default function DetailedPermissionsEditor({
  value,
  policy,
  role,
  disabled,
  discountLimit,
  onChange,
  onPolicyChange,
  onDiscountChange,
}: {
  value?: DetailedAccessRules | null;
  policy: AccessPolicy;
  role: string;
  disabled: boolean;
  discountLimit: number;
  onChange: (value: DetailedAccessRules) => void;
  onPolicyChange: (value: AccessPolicy) => void;
  onDiscountChange: (value: number) => void;
}) {
  const [department, setDepartment] = useState("Todos");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("proposals");
  const rules = value || emptyRules();
  const departments = [
    "Todos",
    ...new Set(ACCESS_SCREENS.map((s) => s.department)),
  ];
  const screens = ACCESS_SCREENS.filter(
    (s) =>
      (department === "Todos" || s.department === department) &&
      (s.label + " " + s.department)
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const screen = screens.find((s) => s.key === active) || screens[0];
  function actionsFor(
    target: (typeof ACCESS_SCREENS)[number],
  ): Record<string, boolean> {
    return {
      ...(policy[target.section] as Record<string, boolean>),
      ...(target.key === "hrDocumentation"
        ? {
            manageCertifications: policy.users.manageCertifications,
            manageSpecialties: policy.users.manageSpecialties,
          }
        : {}),
    };
  }
  const source = screen ? actionsFor(screen) : {};
  const extraActions =
    screen && ["team", "deliveries"].includes(screen.key)
      ? ["create", "update", "delete"]
      : [];
  const actionKeys = [...new Set([...Object.keys(source), ...extraActions])];
  const hasMatrix = Object.keys(rules.screens).length > 0;
  const current = screen
    ? rules.screens[screen.key] || {
        view: !hasMatrix && Boolean(policy.pages[screen.parent]),
        actions: Object.fromEntries(
          actionKeys
            .filter((k) => k !== "view")
            .map((k) => [k, !hasMatrix && source[k] === true]),
        ),
      }
    : { view: false, actions: {} };
  function updateScreen(view: boolean, actions: Record<string, boolean>) {
    if (!screen) return;
    onChange({
      ...rules,
      screens: {
        ...Object.fromEntries(
          ACCESS_SCREENS.map((s) => [
            s.key,
            rules.screens[s.key] || {
              view: !hasMatrix && Boolean(policy.pages[s.parent]),
              actions: Object.fromEntries(
                Object.entries(actionsFor(s))
                  .filter(([k]) => k !== "view")
                  .map(([k, v]) => [k, !hasMatrix && v === true]),
              ),
            },
          ]),
        ),
        [screen.key]: { view, actions },
      },
    });
    if (view)
      onPolicyChange({
        ...policy,
        pages: { ...policy.pages, [screen.parent]: true },
        [screen.section]: {
          ...policy[screen.section],
          ...(typeof source.view === "boolean" ? { view: true } : {}),
          ...(screen.section === "studio" ? { access: true } : {}),
        },
      });
  }
  function toggleAction(key: string, checked: boolean) {
    if (!screen) return;
    updateScreen(current.view, { ...current.actions, [key]: checked });
    const owner =
      screen.key === "hrDocumentation" &&
      ["manageCertifications", "manageSpecialties"].includes(key)
        ? "users"
        : screen.section;
    if (
      checked ||
      (owner === "catalog" && key === "viewCosts") ||
      (owner === "users" && key === "viewLiveLocation")
    )
      onPolicyChange({
        ...policy,
        pages: { ...policy.pages, [screen.parent]: true },
        [screen.section]: {
          ...policy[screen.section],
          ...(current.view &&
          typeof (policy[screen.section] as Record<string, boolean>).view ===
            "boolean"
            ? { view: true }
            : {}),
          ...(screen.section === "studio" ? { access: true } : {}),
        },
        [owner]: {
          ...policy[owner],
          ...(current.view &&
          typeof (policy[owner] as Record<string, boolean>).view === "boolean"
            ? { view: true }
            : {}),
          ...(owner === "studio" ? { access: true } : {}),
          [key]: checked,
        },
      });
  }
  return (
    <div className="space-y-5">
      {role === "ADMIN" ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          Administradores possuem acesso total. As restrições abaixo se aplicam
          aos demais perfis.
        </p>
      ) : null}
      <fieldset
        disabled={disabled || role === "ADMIN"}
        className="space-y-5 disabled:opacity-70"
      >
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold text-slate-950">
            Carteiras comerciais e alçada
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Marque as carteiras atribuídas ao colaborador. Uma gerente pode
            acessar as três. A separação vale para propostas e oportunidades.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {Object.entries(portfolioLabels).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-lg border bg-white p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={
                    rules.commercial[key as keyof typeof portfolioLabels] ||
                    false
                  }
                  onChange={(e) =>
                    onChange({
                      ...rules,
                      commercial: {
                        ...rules.commercial,
                        [key]: e.target.checked,
                      },
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <label className="mt-4 block max-w-sm text-sm font-medium">
            Limite individual de desconto (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={discountLimit}
              onChange={(e) => onDiscountChange(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">
            O limite considera os descontos dos itens e o desconto geral da
            proposta. Acima dele, é necessário solicitar aprovação.
          </p>
        </section>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Departamentos das telas"
        >
          {departments.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={department === d}
              onClick={() => setDepartment(d)}
              className={
                "rounded-full border px-3 py-2 text-xs font-semibold " +
                (d === department
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "bg-white text-slate-700")
              }
            >
              {d}
            </button>
          ))}
        </div>
        <label className="block text-sm font-medium">
          Buscar tela
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Ex.: renovações, contas a pagar, banco de horas"
          />
        </label>
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div
            role="tablist"
            aria-label="Telas do sistema"
            aria-orientation="vertical"
            className="flex max-h-[480px] flex-col gap-1 overflow-y-auto rounded-xl border bg-slate-50 p-2"
          >
            {screens.map((s) => (
              <button
                key={s.key}
                id={"screen-tab-" + s.key}
                type="button"
                role="tab"
                aria-selected={screen?.key === s.key}
                aria-controls="screen-permissions-panel"
                onClick={() => setActive(s.key)}
                className={
                  "rounded-lg px-3 py-3 text-left text-sm " +
                  (screen?.key === s.key
                    ? "bg-white font-bold text-blue-800 shadow-sm"
                    : "text-slate-600 hover:bg-white")
                }
              >
                {s.label}
              </button>
            ))}
          </div>
          {screen ? (
            <section
              role="tabpanel"
              id="screen-permissions-panel"
              aria-labelledby={"screen-tab-" + screen.key}
              className="min-w-0 rounded-xl border p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                {screen.department}
              </p>
              <h3 className="mt-1 text-lg font-bold">{screen.label}</h3>
              <label className="mt-4 flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={current.view}
                  onChange={(e) =>
                    updateScreen(e.target.checked, current.actions)
                  }
                />
                Pode visualizar esta tela
              </label>
              {["contracts", "renewals"].includes(screen.key) &&
              !rules.commercial.contracts ? (
                <p className="mt-2 text-sm text-amber-800">
                  Para acessar esta tela, atribua também a carteira Contratos
                  acima.
                </p>
              ) : null}
              <h4 className="mb-3 mt-5 text-sm font-semibold">
                O que pode fazer nesta tela
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {actionKeys
                  .filter(
                    (k) =>
                      ![
                        "view",
                        "viewOwn",
                        "commentOwn",
                        "viewSensitive",
                        "manageSensitive",
                        "access",
                      ].includes(k),
                  )
                  .map((k) => (
                    <label
                      key={k}
                      className="flex items-start gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={current.actions[k] === true}
                        disabled={!current.view}
                        onChange={(e) => toggleAction(k, e.target.checked)}
                      />
                      {screen.key === "team" && k === "create"
                        ? "Publicar e enviar mensagens"
                        : screen.key === "deliveries" && k === "create"
                          ? "Enviar documentos"
                          : ACCESS_ACTION_LABELS[k] || k}
                    </label>
                  ))}
              </div>
              {!current.view ? (
                <p className="mt-3 text-xs text-slate-500">
                  A tela fica oculta no menu e bloqueada por acesso direto.
                </p>
              ) : null}
            </section>
          ) : (
            <p>Nenhuma tela encontrada.</p>
          )}
        </div>
        <section className="rounded-xl border p-4">
          <h3 className="font-semibold">Tipos de tarefa que pode criar</h3>
          <p className="mt-1 text-sm text-slate-600">
            A criação também exige a ação Criar na tela Ordens. Técnicos ficam
            restritos a atendimentos emergenciais durante um plantão cadastrado.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {Object.entries(typeLabels).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rules.orderTypes[key] === true}
                  disabled={role === "TECHNICIAN" && key !== "EMERGENCY"}
                  onChange={(e) =>
                    onChange({
                      ...rules,
                      orderTypes: {
                        ...rules.orderTypes,
                        [key]: e.target.checked,
                      },
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <h4 className="mt-6 font-semibold">Plantões do colaborador</h4>
          <p className="mt-1 text-sm text-slate-600">
            Horário de Brasília. Cadastre o período completo: das 18h às 8h do
            dia seguinte, ou de sexta às 18h até segunda às 8h. Para feriados,
            inclua o intervalo correspondente.
          </p>
          <div className="mt-3 space-y-3">
            {rules.onCallShifts.map((shift, index) => (
              <div
                key={index}
                className="grid items-end gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto]"
              >
                {(["startsAt", "endsAt"] as const).map((key) => (
                  <label key={key} className="min-w-0 text-sm">
                    {key === "startsAt"
                      ? "Início do plantão"
                      : "Fim do plantão"}
                    <input
                      aria-label={
                        (key === "startsAt" ? "Início" : "Fim") +
                        " do plantão " +
                        (index + 1)
                      }
                      type="datetime-local"
                      value={localDate(shift[key])}
                      onChange={(e) =>
                        onChange({
                          ...rules,
                          onCallShifts: rules.onCallShifts.map((s, i) =>
                            i === index
                              ? {
                                  ...s,
                                  [key]: e.target.value
                                    ? new Date(
                                        e.target.value + ":00-03:00",
                                      ).toISOString()
                                    : "",
                                }
                              : s,
                          ),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...rules,
                      onCallShifts: rules.onCallShifts.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                  className="rounded-lg border px-3 py-2 text-sm text-red-700"
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold text-blue-700"
            onClick={() =>
              onChange({
                ...rules,
                onCallShifts: [
                  ...rules.onCallShifts,
                  { startsAt: "", endsAt: "" },
                ],
              })
            }
          >
            Adicionar plantão
          </button>
        </section>
      </fieldset>
    </div>
  );
}
