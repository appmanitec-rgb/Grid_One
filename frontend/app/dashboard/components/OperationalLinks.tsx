"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { AccessPolicy } from "@/lib/access";
import { canAccessDashboardPath, getAccessFromToken } from "@/lib/access";

type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";
type PermissionRequirement =
  | string
  | ((access: AccessPolicy) => boolean);

export type OperationalLinkItem = {
  label: string;
  href?: string | null;
  description?: string | null;
  badge?: string | null;
  tone?: Tone;
  disabledReason?: string;
  permission?: PermissionRequirement;
};

type BreadcrumbItem = {
  label: string;
  href?: string | null;
  permission?: PermissionRequirement;
};

const TONE_CLASSES: Record<Tone, string> = {
  blue: "border-sky-200 bg-sky-50 text-sky-900",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  rose: "border-rose-200 bg-rose-50 text-rose-900",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
};

const LINK_CLASSES =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800";

const DISABLED_CLASSES =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500";

export function PermissionAwareLink({
  href,
  children,
  className,
  fallbackClassName,
  permission,
  title,
}: {
  href?: string | null;
  children: ReactNode;
  className?: string;
  fallbackClassName?: string;
  permission?: PermissionRequirement;
  title?: string;
}) {
  const access = useAccessPolicy();
  const allowed = isAllowed(href, access, permission);

  if (!href || !allowed) {
    return (
      <span className={fallbackClassName || DISABLED_CLASSES} title={title}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={className || LINK_CLASSES}>
      {children}
    </Link>
  );
}

export function OperationalBreadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const access = useAccessPolicy();
  const visible = items.filter((item) => !item.href || isAllowed(item.href, access, item.permission));

  if (visible.length === 0) return null;

  return (
    <nav aria-label="Caminho operacional" className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
      {visible.map((item, index) => {
        const isLast = index === visible.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-2">
            {index > 0 ? <span className="text-slate-300">/</span> : null}
            {item.href && !isLast ? (
              <PermissionAwareLink
                href={item.href}
                permission={item.permission}
                className="max-w-[14rem] truncate text-xs font-bold text-slate-500 transition hover:text-sky-700 hover:underline"
                fallbackClassName="max-w-[14rem] truncate text-xs font-bold text-slate-400"
              >
                {item.label}
              </PermissionAwareLink>
            ) : (
              <span className="max-w-[18rem] truncate text-slate-800">{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function EntityBadge({
  label,
  tone = "slate",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}

export function QuickActions({ items }: { items: OperationalLinkItem[] }) {
  const access = useAccessPolicy();
  const visible = items.filter((item) => item.href && isAllowed(item.href, access, item.permission));

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((item) => (
        <PermissionAwareLink
          key={`${item.href}-${item.label}`}
          href={item.href}
          permission={item.permission}
          className={item.tone === "emerald" ? `${LINK_CLASSES} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100` : LINK_CLASSES}
        >
          {item.label}
        </PermissionAwareLink>
      ))}
    </div>
  );
}

export function RelatedEntityCard({
  item,
}: {
  item: OperationalLinkItem;
}) {
  const access = useAccessPolicy();
  const allowed = isAllowed(item.href, access, item.permission);
  const content = (
    <article className="h-full rounded-2xl border border-slate-200 bg-slate-50/85 p-4 transition hover:border-sky-200 hover:bg-sky-50">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-slate-900">{item.label}</p>
          {item.description ? (
            <p className="mt-1 break-words text-xs leading-5 text-slate-600">
              {item.description}
            </p>
          ) : null}
        </div>
        {item.badge ? <EntityBadge label={item.badge} tone={item.tone} /> : null}
      </div>
      {item.href && allowed ? (
        <p className="mt-3 text-xs font-bold text-sky-700">Abrir relacionamento</p>
      ) : (
        <p className="mt-3 text-xs font-semibold text-slate-500">
          {item.disabledReason || "Sem acesso ou vinculo navegavel."}
        </p>
      )}
    </article>
  );

  if (!item.href || !allowed) return content;
  return <Link href={item.href}>{content}</Link>;
}

export function RelatedEntityGrid({
  items,
  empty = "Nenhum relacionamento encontrado.",
}: {
  items: OperationalLinkItem[];
  empty?: string;
}) {
  const visibleItems = items.filter((item) => item.label);

  if (visibleItems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-5 text-center text-sm font-semibold text-slate-500">
        {empty}
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {visibleItems.map((item) => (
        <RelatedEntityCard key={`${item.href || item.label}-${item.description || ""}`} item={item} />
      ))}
    </div>
  );
}

function useAccessPolicy() {
  const [access, setAccess] = useState(() => getAccessFromToken());

  useEffect(() => {
    setAccess(getAccessFromToken());
  }, []);

  return access;
}

function isAllowed(
  href: string | null | undefined,
  access: AccessPolicy,
  permission?: PermissionRequirement,
) {
  if (!href) return false;
  if (permission && !hasPermission(access, permission)) return false;
  if (href.startsWith("/dashboard")) {
    return canAccessDashboardPath(href, access.pages);
  }
  return true;
}

function hasPermission(access: AccessPolicy, requirement: PermissionRequirement) {
  if (typeof requirement === "function") return requirement(access);
  const [section, action] = requirement.split(".");
  const permissions = (access as unknown as Record<string, Record<string, boolean> | undefined>)[section];
  return Boolean(permissions?.[action]);
}
