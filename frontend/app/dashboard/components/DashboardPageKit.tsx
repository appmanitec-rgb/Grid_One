import { SelectField } from "@/app/dashboard/components/SelectField";
import { WorkspaceState } from "./WorkspaceState";
import { InterfaceIcon } from "./InterfaceIcon";
import CompactIndicators from "./CompactIndicators";
import { cloneElement, isValidElement, useId, type ReactElement } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";

type HeroStat = {
  label: string;
  value: string;
  helper?: string;
  tone?: Tone;
};

type PageHeroProps = {
  eyebrow?: string;
  title: string;
  description: ReactNode;
  stats?: HeroStat[];
  actions?: ReactNode;
  aside?: ReactNode;
  asideLayout?: "side" | "stacked";
  compact?: boolean;
  contextLabel?: string;
  contextExpanded?: boolean;
  loading?: boolean;
};

type SectionCardProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  actionsLayout?: "inline" | "below";
  children: ReactNode;
  className?: string;
};

type FormFieldProps = {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
};

type FieldTone = "default" | "warning";

const HERO_STAT_TONES: Record<Tone, string> = {
  blue: "bg-sky-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-500",
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="dashboard-page-header">
      <div className="dashboard-page-header-copy">
        {eyebrow ? <p className="dashboard-page-eyebrow">{eyebrow}</p> : null}
        <h1 className="dashboard-page-title">{title}</h1>
        {description ? (
          <p className="dashboard-page-description">{description}</p>
        ) : null}
        {meta ? <div className="dashboard-page-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="dashboard-page-actions">{actions}</div> : null}
    </header>
  );
}

export function PageHero({
  eyebrow,
  title,
  description,
  stats = [],
  actions,
  aside,
  contextLabel = "Mais informações",
  contextExpanded = false,
  loading = false,
}: PageHeroProps) {
  return (
    <div className="dashboard-page dashboard-page-intro space-y-4">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
      />
      {stats.length > 0 ? (
        <KpiStrip
          stats={stats}
          loading={loading}
          context={aside}
          contextLabel={contextLabel}
          contextExpanded={contextExpanded}
        />
      ) : null}
      {aside && !stats.length ? (
        <details
          className="dashboard-page-context"
          open={contextExpanded || undefined}
        >
          <summary>
            <span>{contextLabel}</span>
            <InterfaceIcon name="chevron-down" className="h-4 w-4 shrink-0" />
          </summary>
          <div className="dashboard-page-context-body">{aside}</div>
        </details>
      ) : null}
    </div>
  );
}

export function KpiStrip({
  stats,
  loading = false,
  context,
  contextLabel,
  contextExpanded = false,
}: {
  stats: HeroStat[];
  loading?: boolean;
  context?: ReactNode;
  contextLabel?: string;
  contextExpanded?: boolean;
}) {
  return (
    <CompactIndicators
      initiallyOpen={contextExpanded}
      summary={stats.slice(0, 2).map((stat, index) => (
        <span
          key={stat.label}
          className={index ? "hidden text-xs sm:inline" : "text-xs"}
        >
          {stat.label}{" "}
          <strong className="ml-1 text-sm tabular-nums">
            {loading ? "…" : stat.value}
          </strong>
        </span>
      ))}
    >
      <div className="dashboard-kpi-strip">
        <div
          className="dashboard-metrics-grid"
          aria-label="Indicadores do módulo"
        >
          {stats.map((stat) => (
            <MetricCard
              key={stat.label}
              loading={loading}
              label={stat.label}
              value={stat.value}
              tone={stat.tone}
            />
          ))}
        </div>
        {stats.some((stat) => stat.helper) ? (
          <details className="dashboard-kpi-help">
            <summary>Detalhes dos indicadores</summary>
            <dl>
              {stats
                .filter((stat) => stat.helper)
                .map((stat) => (
                  <div key={stat.label}>
                    <dt>{stat.label}</dt>
                    <dd>{stat.helper}</dd>
                  </div>
                ))}
            </dl>
          </details>
        ) : null}
        {context ? (
          <details
            className="dashboard-page-context mt-2"
            open={contextExpanded || undefined}
          >
            <summary>{contextLabel || "Mais informações"}</summary>
            <div className="dashboard-page-context-body">{context}</div>
          </details>
        ) : null}
      </div>
    </CompactIndicators>
  );
}

export function MetricCard({
  label,
  value,
  helper,
  tone = "slate",
  loading = false,
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: Tone;
  loading?: boolean;
}) {
  return (
    <article className="dashboard-metric-card" aria-busy={loading}>
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <span
          aria-hidden="true"
          className={cx(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            HERO_STAT_TONES[tone],
          )}
        />
        {label}
      </p>
      <p className="mt-2 break-words text-[1.4rem] font-bold leading-tight tabular-nums text-slate-950">
        {loading ? (
          <span
            className="dashboard-metric-placeholder"
            aria-label="Carregando indicador"
          >
            —
          </span>
        ) : (
          value
        )}
      </p>
      {helper ? (
        <p className="mt-1.5 text-xs leading-5 text-slate-500">{helper}</p>
      ) : null}
    </article>
  );
}

export function SectionCard({
  title,
  description,
  eyebrow,
  actions,
  actionsLayout = "inline",
  children,
  className,
}: SectionCardProps) {
  return (
    <section
      className={cx(
        "dashboard-section-card min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.03)]",
        className,
      )}
    >
      <div
        className={cx(
          "dashboard-section-header flex min-w-0 flex-col gap-3 border-b border-slate-100 pb-4",
          actionsLayout === "inline" &&
            "xl:flex-row xl:items-start xl:justify-between",
        )}
      >
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-semibold text-sky-700">{eyebrow}</p>
          ) : null}
          <h2 className="dashboard-section-title mt-1 text-lg font-bold leading-snug text-slate-950">
            {title}
          </h2>
          {description ? (
            <p className="dashboard-section-description mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div
            className={cx(
              "dashboard-section-actions flex min-w-0 max-w-full flex-wrap gap-2",
              actionsLayout === "below" ? "w-full" : "xl:justify-end",
            )}
          >
            {actions}
          </div>
        ) : null}
      </div>
      <div className="dashboard-section-body min-w-0 pt-5">{children}</div>
    </section>
  );
}

export function InlineMessage({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: FieldTone;
}) {
  const toneClasses =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-white/85 text-slate-700";

  return (
    <div
      className={cx(
        "dashboard-inline-message rounded-xl border px-4 py-3 text-sm",
        toneClasses,
      )}
    >
      {children}
    </div>
  );
}

export function StatusBanner({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  const toneClasses: Record<Tone, string> = {
    blue: "border-sky-200 bg-sky-50 text-sky-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    slate: "border-slate-200 bg-slate-100 text-slate-700",
  };

  return (
    <div
      className={cx(
        "dashboard-status-banner rounded-xl border px-4 py-3 text-sm",
        toneClasses[tone],
      )}
    >
      {children}
    </div>
  );
}

export function FormField({
  label,
  hint,
  className,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const field = isValidElement(children)
    ? (children as ReactElement<{
        id?: string;
        "aria-describedby"?: string;
        "aria-labelledby"?: string;
      }>)
    : null;
  const id = field?.props.id || generatedId;
  return (
    <div className={cx("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <label
          id={id + "-label"}
          htmlFor={id}
          className="text-sm font-semibold text-slate-700"
        >
          {label}
        </label>
        {hint ? (
          <span id={id + "-hint"} className="text-xs text-[var(--text-muted)]">
            {hint}
          </span>
        ) : null}
      </div>
      {field
        ? cloneElement(field, {
            id,
            "aria-labelledby": id + "-label",
            "aria-describedby":
              [field.props["aria-describedby"], hint ? id + "-hint" : ""]
                .filter(Boolean)
                .join(" ") || undefined,
          })
        : children}
    </div>
  );
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "app-input w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900",
        className,
      )}
    />
  );
}

export function SelectInput({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <SelectField
      {...props}
      className={cx(
        "app-input w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900",
        className,
      )}
    />
  );
}

export function TextAreaInput({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "app-input min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900",
        className,
      )}
    />
  );
}

export function FieldBox({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "app-field-box rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DataPill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  const toneClasses: Record<Tone, string> = {
    blue: "border-sky-200 bg-sky-50 text-sky-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    slate: "border-slate-200 bg-slate-100 text-slate-700",
  };

  return (
    <span
      className={cx(
        "app-data-pill inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <WorkspaceState title={title} description={description} actions={actions} />
  );
}
