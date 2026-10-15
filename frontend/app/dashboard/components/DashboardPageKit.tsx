import { WorkspaceState } from "./WorkspaceState";
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
  blue: "from-sky-500 via-cyan-400 to-cyan-300",
  emerald: "from-emerald-500 via-teal-400 to-cyan-300",
  amber: "from-amber-500 via-orange-400 to-amber-300",
  rose: "from-rose-500 via-red-500 to-orange-400",
  slate: "from-slate-700 via-slate-500 to-slate-400",
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
        {description ? <p className="dashboard-page-description">{description}</p> : null}
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
  contextLabel = "Contexto e informações adicionais",
  contextExpanded = false,
  loading = false,
}: PageHeroProps) {
  return (
    <div className="dashboard-page dashboard-page-intro space-y-4">
      <PageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
      {stats.length > 0 ? (
        <div className="dashboard-metrics-grid">
          {stats.map((stat) => (
            <MetricCard
              key={stat.label}
              loading={loading}
              label={stat.label}
              value={stat.value}
              helper={stat.helper}
              tone={stat.tone}
            />
          ))}
        </div>
      ) : null}
      {aside ? (
        <details className="dashboard-page-context" open={contextExpanded || undefined}>
          <summary>
            <span>{contextLabel}</span>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0">
              <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="dashboard-page-context-body">{aside}</div>
        </details>
      ) : null}
    </div>
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
        <span aria-hidden="true" className={cx("h-2 w-2 shrink-0 rounded-full bg-gradient-to-r", HERO_STAT_TONES[tone])} />
        {label}
      </p>
      <p className="mt-2 break-words text-[1.4rem] font-bold leading-tight tabular-nums text-slate-950">
        {loading ? <span className="dashboard-metric-placeholder" aria-label="Carregando indicador">—</span> : value}
      </p>
      {helper ? <p className="mt-1.5 text-xs leading-5 text-slate-500">{helper}</p> : null}
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
      <div className={cx("dashboard-section-header flex min-w-0 flex-col gap-3 border-b border-slate-100 pb-4", actionsLayout === "inline" && "xl:flex-row xl:items-start xl:justify-between")}>
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-semibold text-sky-700">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="dashboard-section-title mt-1 text-lg font-bold leading-snug text-slate-950">
            {title}
          </h2>
          {description ? (
            <p className="dashboard-section-description mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
          ) : null}
        </div>
        {actions ? <div className={cx("dashboard-section-actions flex min-w-0 max-w-full flex-wrap gap-2", actionsLayout === "below" ? "w-full" : "xl:justify-end")}>{actions}</div> : null}
      </div>
      <div className="min-w-0 pt-5">{children}</div>
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
    <div className={cx("rounded-2xl border px-4 py-3 text-sm shadow-sm", toneClasses)}>
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
    blue: "border-sky-200 bg-[linear-gradient(135deg,#eef6ff_0%,#f8fbff_100%)] text-sky-900",
    emerald: "border-emerald-200 bg-[linear-gradient(135deg,#edfdf4_0%,#f8fffb_100%)] text-emerald-900",
    amber: "border-amber-200 bg-[linear-gradient(135deg,#fff5e7_0%,#fffaf3_100%)] text-amber-900",
    rose: "border-rose-200 bg-[linear-gradient(135deg,#fff0f1_0%,#fff8f8_100%)] text-rose-900",
    slate: "border-slate-200 bg-slate-100 text-slate-700",
  };

  return (
    <div
      className={cx(
        "rounded-2xl border px-4 py-3 text-sm shadow-[0_18px_40px_-32px_rgba(15,31,50,0.24)]",
        toneClasses[tone],
      )}
    >
      {children}
    </div>
  );
}

export function FormField({ label, hint, className, children }: FormFieldProps) {
  return (
    <div className={cx("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-semibold text-slate-700">
          {label}
        </label>
        {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
      </div>
      {children}
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
        "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100",
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
    <select
      {...props}
      className={cx(
        "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100",
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
        "min-h-28 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100",
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
        "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700",
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
        "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em]",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <WorkspaceState title={title} description={description} actions={actions} />;
}
