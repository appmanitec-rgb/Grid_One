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
  blue: "border-sky-200 bg-[linear-gradient(180deg,#ffffff_0%,#eff7ff_100%)] text-sky-900",
  emerald: "border-emerald-200 bg-[linear-gradient(180deg,#ffffff_0%,#eefbf4_100%)] text-emerald-900",
  amber: "border-amber-200 bg-[linear-gradient(180deg,#ffffff_0%,#fff8ea_100%)] text-amber-900",
  rose: "border-rose-200 bg-[linear-gradient(180deg,#ffffff_0%,#fff1f3_100%)] text-rose-900",
  slate: "border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] text-slate-900",
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
}: PageHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(19,104,180,0.14),transparent_34%),radial-gradient(circle_at_86%_18%,rgba(217,37,47,0.09),transparent_26%),linear-gradient(145deg,#ffffff_0%,#f7fbff_52%,#eef4fb_100%)] px-6 py-6 shadow-[0_30px_80px_-52px_rgba(15,31,50,0.6)] md:px-7 md:py-7">
      <div className="absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-sky-200/40 blur-3xl" />
      <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-rose-200/30 blur-3xl" />

      <div className="relative space-y-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            {eyebrow ? (
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="mt-3 text-3xl font-bold leading-tight text-slate-950 md:text-4xl">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-[15px]">
              {description}
            </p>
          </div>

          {aside ? <div className="min-w-[280px] max-w-[360px]">{aside}</div> : null}
        </div>

        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}

        {stats.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
    <article
      className={cx(
        "rounded-[24px] border px-4 py-4 shadow-[0_18px_40px_-34px_rgba(15,31,50,0.45)]",
        HERO_STAT_TONES[tone],
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      {helper ? <p className="mt-2 text-xs leading-5 text-slate-600">{helper}</p> : null}
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
        "rounded-[28px] border border-slate-200 bg-white/92 p-5 shadow-[0_24px_70px_-52px_rgba(15,31,50,0.45)] backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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

      <div className="mt-5">{children}</div>
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
    blue: "border-sky-200 bg-sky-50 text-sky-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    slate: "border-slate-200 bg-slate-100 text-slate-700",
  };

  return (
    <div
      className={cx(
        "rounded-2xl border px-4 py-3 text-sm shadow-[0_18px_40px_-32px_rgba(15,31,50,0.3)]",
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
        "rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
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
    amber: "border-amber-200 bg-amber-50 text-amber-800",
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
