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
  description: string;
  stats?: HeroStat[];
  actions?: ReactNode;
  aside?: ReactNode;
  asideLayout?: "side" | "stacked";
  compact?: boolean;
};

type SectionCardProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
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

export function PageHero({
  eyebrow,
  title,
  description,
  stats = [],
  actions,
  aside,
  asideLayout = "stacked",
  compact = false,
}: PageHeroProps) {
  const stackedAside = asideLayout === "stacked";

  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-[28px] border border-slate-200/85 bg-[linear-gradient(180deg,#fbfcfd_0%,#f3f6f9_100%)] p-3 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.34)] md:p-4",
        compact ? "rounded-[24px]" : "md:p-5",
      )}
    >
      <div className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-slate-900/20 to-transparent" />
      <div
        className={cx(
          "relative rounded-[24px] border border-white/8 px-5 shadow-[0_28px_70px_-46px_rgba(6,10,18,0.92)] md:px-6",
          compact ? "py-4 md:py-5" : "py-6 md:py-7",
        )}
        style={{ background: "var(--dashboard-hero-background)" }}
      >
        <div
          className="absolute inset-y-0 left-0 w-1.5 rounded-l-[24px]"
          style={{ background: "var(--dashboard-hero-ribbon)" }}
        />
        <div
          className="absolute -right-14 top-0 h-40 w-40 rounded-full blur-3xl"
          style={{ backgroundColor: "var(--dashboard-hero-glow-primary)" }}
        />
        <div
          className="absolute right-16 top-10 h-28 w-28 rounded-full blur-3xl"
          style={{ backgroundColor: "var(--dashboard-hero-glow-secondary)" }}
        />

        <div className="relative">
          <div
            className={cx(
              "grid items-start",
              stackedAside
                ? "grid-cols-1"
                : "[grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]",
              compact ? "gap-4" : "gap-6",
            )}
          >
            <div className="max-w-3xl">
              {eyebrow ? (
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-200">
                  {eyebrow}
                </p>
              ) : null}
              <h1
                className={cx(
                  "mt-2 font-bold leading-tight text-white",
                  compact ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl",
                )}
              >
                {title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 md:text-[15px]">
                {description}
              </p>
            </div>

            {aside ? (
              <div
                className={cx(
                  "dashboard-hero-aside min-w-0 max-w-full break-words rounded-[24px] border border-white/10 bg-white/8 p-1.5 backdrop-blur-sm",
                  stackedAside
                    ? "dashboard-hero-aside-stacked w-full"
                    : "dashboard-hero-aside-side xl:justify-self-end xl:max-w-[360px]",
                )}
              >
                {aside}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={cx("relative space-y-4", compact ? "mt-4" : "mt-5 md:space-y-5")}>
        {actions ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white/90 px-4 py-3 shadow-[0_14px_34px_-28px_rgba(15,31,50,0.35)] sm:flex-row sm:items-center">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Ações da página
            </span>
            <div className="flex min-w-0 flex-wrap gap-2">{actions}</div>
          </div>
        ) : null}

        {stats.length > 0 ? (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr))]">
            {stats.map((stat) => (
              <MetricCard
                key={`${stat.label}-${stat.value}`}
                label={stat.label}
                value={stat.value}
                helper={stat.helper}
                tone={stat.tone}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function MetricCard({
  label,
  value,
  helper,
  tone = "slate",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: Tone;
}) {
  return (
    <article className="overflow-hidden rounded-[24px] border border-slate-200 bg-white/96 shadow-[0_22px_44px_-34px_rgba(15,23,42,0.32)]">
      <div className={cx("h-1.5 w-full bg-gradient-to-r", HERO_STAT_TONES[tone])} />
      <div className="px-4 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </p>
        <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
        {helper ? <p className="mt-2 text-xs leading-5 text-slate-600">{helper}</p> : null}
      </div>
    </article>
  );
}

export function SectionCard({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
}: SectionCardProps) {
  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-[28px] border border-slate-200/85 bg-white/92 p-5 shadow-[0_24px_54px_-40px_rgba(15,23,42,0.24)] backdrop-blur",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.04),transparent_48%)]" />
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-slate-900/18 to-transparent" />
      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          {eyebrow ? (
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-1 text-xl font-bold text-slate-950">{title}</h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>

      <div className="relative mt-5">{children}</div>
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
        <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
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
        "w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100",
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
        "w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100",
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
        "min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100",
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
        "rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f7fafc_100%)] px-4 py-3 text-sm text-slate-700 shadow-[0_12px_30px_-28px_rgba(15,23,42,0.35)]",
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
    blue: "border-slate-200 bg-slate-100 text-slate-700",
    emerald: "border-slate-200 bg-slate-100 text-slate-700",
    amber: "border-stone-200 bg-stone-100 text-stone-700",
    rose: "border-zinc-200 bg-zinc-100 text-zinc-700",
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

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/85 px-5 py-8 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}
    </div>
  );
}
