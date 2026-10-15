"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { canAccessDashboardPath, getAccessFromToken } from "@/lib/access";
import { decodeJwtPayload, getStoredAccessToken } from "@/lib/auth-session";
import { fetchDashboardNotificationInbox, type DashboardNotificationInbox } from "@/lib/dashboard-notifications";
import { conversationLabel, TEAM_ACTIVE_CHANNEL_EVENT, TEAM_CHANNELS_UPDATED_EVENT, type TeamNotificationChannel } from "@/lib/team-notifications";

type MessageNotice = { channel: TeamNotificationChannel; label: string };

function BellIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
}
function CloseIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" d="m5 5 10 10M15 5 5 15" /></svg>;
}
function messageHref(channelId: string) { return "/dashboard/team?channel=" + encodeURIComponent(channelId); }

export default function NotificationCenter() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [channels, setChannels] = useState<TeamNotificationChannel[]>([]);
  const [inbox, setInbox] = useState<DashboardNotificationInbox | null>(null);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [channelsError, setChannelsError] = useState(false);
  const [alertsError, setAlertsError] = useState(false);
  const [notice, setNotice] = useState<MessageNotice | null>(null);
  const [paused, setPaused] = useState(false);
  const [noticeBottom, setNoticeBottom] = useState<number | undefined>(undefined);
  const [canRead, setCanRead] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    setMounted(true);
    let active = true;
    let channelsBusy = false;
    let alertsBusy = false;
    let baseline: Map<string, string> | null = null;
    let activeChannel: string | null = null;
    const startedAt = Date.now();
    const me = decodeJwtPayload(getStoredAccessToken() || "")?.sub || "";
    const allowed = canAccessDashboardPath("/dashboard/team", getAccessFromToken().pages);
    setUserId(me);
    setCanRead(allowed);
    if (!allowed) { setLoading(false); return; }

    async function loadChannels() {
      if (channelsBusy) return;
      channelsBusy = true;
      try {
        const response = await apiFetch("/team/channels", { cache: "no-store" });
        if (!response.ok) throw new Error("channels");
        const result = await response.json() as TeamNotificationChannel[];
        if (!active) return;
        const fresh = result.filter(channel => {
          const last = channel.lastMessage;
          return baseline && last && channel.unreadCount > 0 && last.author.id !== me &&
            channel.id !== activeChannel && baseline.get(channel.id) !== last.createdAt &&
            (baseline.has(channel.id) || new Date(last.createdAt).getTime() >= startedAt);
        }).sort((a,b) => (b.lastMessage?.createdAt || "").localeCompare(a.lastMessage?.createdAt || ""));
        baseline = new Map(result.map(channel => [channel.id, channel.lastMessage?.createdAt || ""]));
        setChannels(result);
        setChannelsError(false);
        if (fresh[0]) {
          setNotice({ channel: fresh[0], label: conversationLabel(fresh[0], me) });
          setPaused(false);
        }
      } catch { if (active) setChannelsError(true); }
      finally { channelsBusy = false; if (active) setLoading(false); }
    }
    async function loadAlerts() {
      if (alertsBusy) return;
      alertsBusy = true;
      try {
        const result = await fetchDashboardNotificationInbox(6);
        if (active) { setInbox(result); setAlertsError(false); }
      } catch { if (active) setAlertsError(true); }
      finally { alertsBusy = false; }
    }
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void loadChannels();
      void loadAlerts();
    };
    const activeChanged = (event: Event) => {
      activeChannel = (event as CustomEvent<string | null>).detail;
      setNotice(current => current?.channel.id === activeChannel ? null : current);
    };
    const readChanged = () => { if (document.visibilityState === "visible") void loadChannels(); };
    refreshRef.current = refresh;
    refresh();
    const channelTimer = window.setInterval(readChanged, 12_000);
    const alertTimer = window.setInterval(() => { if (document.visibilityState === "visible") void loadAlerts(); }, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(TEAM_ACTIVE_CHANNEL_EVENT, activeChanged);
    window.addEventListener(TEAM_CHANNELS_UPDATED_EVENT, readChanged);
    return () => {
      active = false;
      window.clearInterval(channelTimer);
      window.clearInterval(alertTimer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(TEAM_ACTIVE_CHANNEL_EVENT, activeChanged);
      window.removeEventListener(TEAM_CHANNELS_UPDATED_EVENT, readChanged);
    };
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    refreshRef.current();
    panelRef.current?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  useEffect(() => {
    if (!notice || paused || open) return;
    const timer = window.setTimeout(() => setNotice(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [notice, paused, open]);

  useEffect(() => {
    if (!notice) return;
    // Keep proposal totals and save/navigation actions available beneath the notice.
    const dock = document.querySelector(".proposal-finance-dock");
    if (!dock) { setNoticeBottom(undefined); return; }
    const update = () => setNoticeBottom(Math.max(24, window.innerHeight - dock.getBoundingClientRect().top + 12));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dock);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [notice, pathname]);

  if (!canRead) return null;
  const unreadChannels = channels.filter(channel => channel.unreadCount > 0)
    .sort((a,b) => (b.lastMessage?.createdAt || "").localeCompare(a.lastMessage?.createdAt || ""));
  const unread = unreadChannels.reduce((total, channel) => total + channel.unreadCount, 0);
  const pending = inbox?.summary.actionRequired || 0;
  const count = unread + pending;
  const close = () => { setOpen(false); buttonRef.current?.focus(); };

  return <>
    <button ref={buttonRef} type="button" onClick={() => setOpen(value => !value)}
      aria-label={"Notificações: " + unread + " mensagens não lidas e " + pending + " pendências"}
      aria-expanded={open} aria-controls={open ? "notification-panel" : undefined} aria-haspopup="dialog" title="Notificações"
      className="dashboard-topbar-control relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
      <BellIcon />
      {count > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-slate-800" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
    </button>
    {mounted && createPortal(<>
      {open && <section id="notification-panel" ref={panelRef} role="dialog" aria-label="Notificações" tabIndex={-1}
        className="fixed right-3 top-[72px] z-50 flex max-h-[calc(100dvh-100px)] w-[min(390px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl outline-none sm:right-6">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div><h2 className="text-base font-bold">Notificações</h2><p className="mt-0.5 text-xs text-slate-500">{unread} mensagens não lidas · {pending} pendências</p></div>
          <button type="button" onClick={close} aria-label="Fechar notificações" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-500"><CloseIcon /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain">
          <div className="px-5 pb-2 pt-4"><h3 className="text-sm font-semibold">Mensagens da equipe</h3></div>
          {loading ? <p className="px-5 py-4 text-sm text-slate-500" role="status">Carregando mensagens...</p> : null}
          {channelsError && <p className="px-5 py-3 text-sm text-amber-800">Não foi possível atualizar as mensagens. <button type="button" className="font-semibold underline" onClick={() => refreshRef.current()}>Tentar novamente</button></p>}
          {!loading && !channelsError && !unread && <p className="px-5 py-4 text-sm text-slate-500">Você está em dia com as conversas.</p>}
          {unreadChannels.slice(0,6).map(channel => <Link key={channel.id} href={messageHref(channel.id)} onClick={() => { setOpen(false); setNotice(null); }} className="flex gap-3 border-l-2 border-sky-500 px-5 py-3 hover:bg-sky-50 focus-visible:outline-sky-500">
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{conversationLabel(channel,userId)}</p><p className="mt-1 line-clamp-2 break-words text-xs text-slate-500">{channel.lastMessage?.author.name}: {channel.lastMessage?.body}</p></div>
            <span className="h-fit shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">{channel.unreadCount}</span>
          </Link>)}
          <div className="mx-5 mt-3 border-t border-slate-100 pb-2 pt-4"><h3 className="text-sm font-semibold">Alertas do sistema</h3></div>
          {alertsError ? <p className="px-5 py-3 text-sm text-amber-800">Não foi possível atualizar os alertas. <button type="button" className="font-semibold underline" onClick={() => refreshRef.current()}>Tentar novamente</button></p> : null}
          {!inbox && !alertsError ? <p className="px-5 py-4 text-sm text-slate-500">Carregando alertas...</p> : null}
          {inbox?.items.slice(0,6).map(item => <Link key={item.id} href={item.href} onClick={() => setOpen(false)} className="block px-5 py-3 hover:bg-slate-50 focus-visible:outline-sky-500"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 line-clamp-2 break-words text-xs text-slate-500">{item.message}</p></Link>)}
          {inbox && !inbox.items.length && !alertsError ? <p className="px-5 py-4 text-sm text-slate-500">Nenhum alerta no momento.</p> : null}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 text-center text-xs font-semibold text-sky-800">
          <Link href="/dashboard/team" onClick={() => setOpen(false)} className="rounded-lg px-2 py-2 hover:bg-white">Abrir conversas</Link>
          <Link href="/dashboard/notifications" onClick={() => setOpen(false)} className="rounded-lg px-2 py-2 hover:bg-white">Ver todos os alertas</Link>
        </div>
      </section>}
      {notice && !open && <aside style={noticeBottom ? { bottom: noticeBottom } : undefined} role="status" aria-live="polite" aria-atomic="true" aria-label="Nova mensagem da equipe"
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
        className="fixed bottom-24 right-3 z-40 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 border-l-4 border-l-sky-500 bg-white p-4 text-slate-900 shadow-xl sm:bottom-6 sm:right-6">
        <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-sky-700">Nova mensagem · {notice.label}</p><p className="mt-1 truncate text-sm font-bold">{notice.channel.lastMessage?.author.name}</p><p className="mt-1 line-clamp-2 break-words text-sm text-slate-600">{notice.channel.lastMessage?.body}</p></div>
          <button type="button" aria-label="Dispensar aviso de mensagem" onClick={() => setNotice(null)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><CloseIcon /></button>
        </div>
        <Link href={messageHref(notice.channel.id)} onClick={() => { setNotice(null); setOpen(false); }} className="mt-3 inline-flex rounded-lg bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100">Abrir conversa</Link>
      </aside>}
    </>, document.body)}
  </>;
}
