"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { decodeJwtPayload, getStoredAccessToken } from "@/lib/auth-session";

type Author = {
  id: string;
  name: string;
  role: string;
  profilePhotoUrl?: string | null;
};
type Comment = {
  id: string;
  body: string;
  author: Author;
  createdAt: string;
  canDelete: boolean;
};
type Post = {
  id: string;
  body: string;
  author: Author;
  createdAt: string;
  editedAt?: string | null;
  pinnedAt?: string | null;
  reactionCount: number;
  commentCount: number;
  likedByMe: boolean;
  canEdit: boolean;
  canDelete: boolean;
  comments: Comment[];
};
type FeedPage = {
  items: Post[];
  nextCursor: string | null;
  canModerate: boolean;
};
type CommentPage = { items: Comment[]; nextCursor: string | null };
type Channel = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  unreadCount: number;
  lastMessage?: { body: string; createdAt: string; author: Author } | null;
};
type Message = {
  id: string;
  body: string;
  author: Author;
  createdAt: string;
  editedAt?: string | null;
  canEdit: boolean;
  canDelete: boolean;
};
type MessagePage = { items: Message[]; nextCursor: string | null };
type DeleteTarget = { kind: "post" | "comment" | "message"; id: string };

async function request<T>(
  path: string,
  method = "GET",
  body?: object,
): Promise<T> {
  const response = await apiFetch(path, {
    method,
    cache: "no-store",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(
        response,
        "Não foi possível concluir a operação.",
      ),
    );
  }
  return response.json() as Promise<T>;
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function timeLabel(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Avatar({
  author,
  size = "normal",
}: {
  author: Author;
  size?: "normal" | "small";
}) {
  return (
    <span
      aria-label={author.name}
      title={author.name}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#17324c] font-bold text-white ${size === "small" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-xs"}`}
    >
      {author.profilePhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={author.profilePhotoUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        initials(author.name)
      )}
    </span>
  );
}

const secondaryButton =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton =
  "rounded-xl bg-[#d42d3b] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#b92230] disabled:cursor-not-allowed disabled:opacity-50";

export default function TeamPage() {
  const [tab, setTab] = useState<"feed" | "chat">("feed");
  const [meId, setMeId] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [canModerate, setCanModerate] = useState(false);
  const [postDraft, setPostDraft] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [expandedComments, setExpandedComments] = useState<
    Record<string, CommentPage>
  >({});
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const loadedOlderRef = useRef(false);
  const activeChannelRef = useRef<string | null>(null);

  const activeChannel = channels.find(
    (channel) => channel.id === activeChannelId,
  );
  const totalUnread = useMemo(
    () => channels.reduce((sum, channel) => sum + channel.unreadCount, 0),
    [channels],
  );

  const loadFeed = useCallback(async (cursor?: string) => {
    if (!cursor) setFeedLoading(true);
    try {
      const page = await request<FeedPage>(
        `/team/feed?limit=15${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      setPosts((current) =>
        cursor
          ? [
              ...current,
              ...page.items.filter(
                (item) => !current.some((old) => old.id === item.id),
              ),
            ]
          : page.items,
      );
      setFeedCursor(page.nextCursor);
      setCanModerate(page.canModerate);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar o feed.",
      );
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const loadChannels = useCallback(async () => {
    try {
      const result = await request<Channel[]>("/team/channels");
      setChannels(result);
      setActiveChannelId((current) =>
        current && result.some((channel) => channel.id === current)
          ? current
          : (result[0]?.id ?? null),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os canais.",
      );
    }
  }, []);

  const loadMessages = useCallback(
    async (channelId: string, before?: string, quiet = false) => {
      if (!quiet) setChatLoading(true);
      const scroll = chatScrollRef.current;
      const nearBottom =
        !scroll ||
        scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 140;
      try {
        const page = await request<MessagePage>(
          `/team/channels/${channelId}/messages?limit=50${before ? `&before=${encodeURIComponent(before)}` : ""}`,
        );
        if (activeChannelRef.current !== channelId) return;
        if (before) {
          loadedOlderRef.current = true;
          setMessages((current) => [...page.items, ...current]);
        } else {
          setMessages((current) => {
            if (!loadedOlderRef.current || !page.items.length)
              return page.items;
            const firstDate = new Date(page.items[0].createdAt).getTime();
            return [
              ...current.filter(
                (item) => new Date(item.createdAt).getTime() < firstDate,
              ),
              ...page.items,
            ];
          });
        }
        if (before || !loadedOlderRef.current)
          setMessageCursor(page.nextCursor);
        if (!before && nearBottom) {
          await request<{ ok: boolean }>(
            `/team/channels/${channelId}/read`,
            "POST",
          );
          setChannels((current) =>
            current.map((channel) =>
              channel.id === channelId
                ? { ...channel, unreadCount: 0 }
                : channel,
            ),
          );
          requestAnimationFrame(() => {
            if (chatScrollRef.current)
              chatScrollRef.current.scrollTop =
                chatScrollRef.current.scrollHeight;
          });
        }
      } catch (cause) {
        if (!quiet)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar as mensagens.",
          );
      } finally {
        if (!quiet) setChatLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const payload = decodeJwtPayload<{ sub?: string }>(
      getStoredAccessToken() || "",
    );
    setMeId(payload?.sub || "");
    void loadFeed();
    void loadChannels();
  }, [loadFeed, loadChannels]);

  useEffect(() => {
    activeChannelRef.current = tab === "chat" ? activeChannelId : null;
    if (tab !== "chat" || !activeChannelId) return;
    loadedOlderRef.current = false;
    setMessages([]);
    setMessageCursor(null);
    void loadMessages(activeChannelId);
  }, [tab, activeChannelId, loadMessages]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadChannels();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadChannels]);

  useEffect(() => {
    if (tab !== "chat" || !activeChannelId) return;
    const messagesTimer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void loadMessages(activeChannelId, undefined, true);
    }, 5000);
    return () => window.clearInterval(messagesTimer);
  }, [tab, activeChannelId, loadMessages]);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir a operação.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitPost() {
    if (!postDraft.trim()) return;
    await perform(async () => {
      await request("/team/feed", "POST", { body: postDraft.trim() });
      setPostDraft("");
      await loadFeed();
    });
  }

  async function submitComment(postId: string) {
    const body = commentDrafts[postId]?.trim();
    if (!body) return;
    await perform(async () => {
      await request(`/team/feed/${postId}/comments`, "POST", { body });
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      setExpandedComments((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
      await loadFeed();
    });
  }

  async function loadComments(postId: string, cursor?: string) {
    await perform(async () => {
      const page = await request<CommentPage>(
        `/team/feed/${postId}/comments?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      setExpandedComments((current) => ({
        ...current,
        [postId]: cursor
          ? {
              items: [...page.items, ...(current[postId]?.items || [])],
              nextCursor: page.nextCursor,
            }
          : page,
      }));
    });
  }

  async function sendMessage() {
    if (!activeChannelId || !messageDraft.trim()) return;
    const channelId = activeChannelId;
    await perform(async () => {
      await request(`/team/channels/${channelId}/messages`, "POST", {
        body: messageDraft.trim(),
      });
      setMessageDraft("");
      await loadMessages(channelId);
      await loadChannels();
      requestAnimationFrame(() => {
        if (chatScrollRef.current)
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      });
    });
  }

  async function createChannel() {
    if (!channelName.trim()) return;
    await perform(async () => {
      const channel = await request<Channel>("/team/channels", "POST", {
        name: channelName.trim(),
        description: channelDescription.trim(),
      });
      setChannelName("");
      setChannelDescription("");
      setShowNewChannel(false);
      await loadChannels();
      setActiveChannelId(channel.id);
      setTab("chat");
    });
  }

  async function saveEdit() {
    if (!editDraft.trim()) return;
    const postId = editingPost;
    const messageId = editingMessage;
    await perform(async () => {
      if (postId) {
        await request(`/team/feed/${postId}`, "PATCH", {
          body: editDraft.trim(),
        });
        await loadFeed();
      }
      if (messageId && activeChannelId) {
        await request(`/team/messages/${messageId}`, "PATCH", {
          body: editDraft.trim(),
        });
        await loadMessages(activeChannelId);
      }
      setEditingPost(null);
      setEditingMessage(null);
      setEditDraft("");
    });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    await perform(async () => {
      const path =
        target.kind === "post"
          ? `/team/feed/${target.id}`
          : target.kind === "comment"
            ? `/team/comments/${target.id}`
            : `/team/messages/${target.id}`;
      await request(path, "DELETE");
      setDeleteTarget(null);
      if (target.kind === "message" && activeChannelId)
        await loadMessages(activeChannelId);
      else await loadFeed();
    });
  }

  return (
    <main className="team-page space-y-5 pb-10">
      <header className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[linear-gradient(115deg,#10253a_0%,#193c56_100%)] px-5 py-6 text-white md:px-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-200">
              Comunicação interna
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
              Equipe Manitec
            </h1>
            <p className="mt-2 text-sm text-slate-200">
              Avisos importantes e conversas organizadas por assunto.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-slate-100">
            <span className="font-bold text-white">Acesso interno</span>
            <br />
            Somente colaboradores autenticados
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-6">
          <div
            role="tablist"
            aria-label="Áreas da equipe"
            className="inline-flex rounded-xl bg-slate-100 p-1"
          >
            <button
              role="tab"
              aria-selected={tab === "feed"}
              type="button"
              onClick={() => setTab("feed")}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${tab === "feed" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              Feed
            </button>
            <button
              role="tab"
              aria-selected={tab === "chat"}
              type="button"
              onClick={() => setTab("chat")}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${tab === "chat" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              Canais{" "}
              {totalUnread > 0 ? (
                <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-800">
                  {totalUnread}
                </span>
              ) : null}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadFeed();
              void loadChannels();
              if (activeChannelId && tab === "chat")
                void loadMessages(activeChannelId);
            }}
            className={secondaryButton}
          >
            Atualizar
          </button>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Fechar aviso"
            className="font-bold"
          >
            ×
          </button>
        </div>
      ) : null}

      {tab === "feed" ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-4">
            <section
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"
              aria-label="Nova publicação"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-950">
                    Compartilhar com a equipe
                  </h2>
                  <p className="text-sm text-slate-600">
                    Avisos, decisões e atualizações relevantes.
                  </p>
                </div>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                  Feed interno
                </span>
              </div>
              <textarea
                value={postDraft}
                onChange={(event) => setPostDraft(event.target.value)}
                maxLength={5000}
                rows={3}
                placeholder="Escreva uma atualização clara para a equipe..."
                className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-500 focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  {postDraft.length}/5000 caracteres
                </span>
                <button
                  type="button"
                  onClick={() => void submitPost()}
                  disabled={busy || !postDraft.trim()}
                  className={primaryButton}
                >
                  Publicar
                </button>
              </div>
            </section>

            {feedLoading && posts.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
                Carregando publicações...
              </div>
            ) : null}
            {!feedLoading && posts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <h2 className="font-bold text-slate-900">O feed está pronto</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Faça a primeira publicação para iniciar a comunicação da
                  equipe.
                </p>
              </div>
            ) : null}

            {posts.map((post) => {
              const expanded = expandedComments[post.id];
              const visibleComments = expanded?.items ?? post.comments;
              return (
                <article
                  key={post.id}
                  className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"
                >
                  {post.pinnedAt ? (
                    <p className="mb-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
                      Aviso fixado
                    </p>
                  ) : null}
                  <div className="flex items-start gap-3">
                    <Avatar author={post.author} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-950">
                        {post.author.name}
                      </p>
                      <p className="text-xs text-slate-600">
                        {timeLabel(post.createdAt)}
                        {post.editedAt ? " · editado" : ""}
                      </p>
                    </div>
                  </div>
                  {editingPost === post.id ? (
                    <div className="mt-4 space-y-2">
                      <textarea
                        value={editDraft}
                        maxLength={5000}
                        onChange={(event) => setEditDraft(event.target.value)}
                        rows={4}
                        className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-sky-500"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveEdit()}
                          disabled={busy || !editDraft.trim()}
                          className={primaryButton}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPost(null)}
                          className={secondaryButton}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">
                      {post.body}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={post.likedByMe}
                      onClick={() =>
                        void perform(async () => {
                          const result = await request<{
                            likedByMe: boolean;
                            reactionCount: number;
                          }>(`/team/feed/${post.id}/react`, "POST");
                          setPosts((current) =>
                            current.map((item) =>
                              item.id === post.id
                                ? { ...item, ...result }
                                : item,
                            ),
                          );
                        })
                      }
                      className={`${secondaryButton} ${post.likedByMe ? "border-rose-200 bg-rose-50 text-rose-800" : ""}`}
                    >
                      ♥ {post.reactionCount}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        expanded
                          ? setExpandedComments((current) => {
                              const next = { ...current };
                              delete next[post.id];
                              return next;
                            })
                          : void loadComments(post.id)
                      }
                      className={secondaryButton}
                    >
                      Comentários {post.commentCount}
                    </button>
                    <span className="flex-1" />
                    {canModerate ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            await request(`/team/feed/${post.id}/pin`, "POST");
                            await loadFeed();
                          })
                        }
                        className={secondaryButton}
                      >
                        {post.pinnedAt ? "Desafixar" : "Fixar"}
                      </button>
                    ) : null}
                    {post.canEdit ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPost(post.id);
                          setEditDraft(post.body);
                        }}
                        className={secondaryButton}
                      >
                        Editar
                      </button>
                    ) : null}
                    {post.canDelete ? (
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({ kind: "post", id: post.id })
                        }
                        className="px-2 py-2 text-xs font-semibold text-rose-700 hover:underline"
                      >
                        Excluir
                      </button>
                    ) : null}
                  </div>
                  {visibleComments.length > 0 || expanded ? (
                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                      {visibleComments.map((comment) => (
                        <div
                          key={comment.id}
                          className="flex items-start gap-2"
                        >
                          <Avatar author={comment.author} size="small" />
                          <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="text-xs text-slate-900">
                                {comment.author.name}
                              </strong>
                              <span className="text-xs text-slate-500">
                                {timeLabel(comment.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
                              {comment.body}
                            </p>
                          </div>
                          {comment.canDelete ? (
                            <button
                              type="button"
                              aria-label={`Excluir comentário de ${comment.author.name}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "comment",
                                  id: comment.id,
                                })
                              }
                              className="px-1 text-sm text-slate-500 hover:text-rose-700"
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                      ))}
                      {expanded?.nextCursor ? (
                        <button
                          type="button"
                          onClick={() =>
                            void loadComments(post.id, expanded.nextCursor!)
                          }
                          className="text-xs font-semibold text-sky-800 hover:underline"
                        >
                          Carregar mais comentários
                        </button>
                      ) : null}
                      {!expanded && post.commentCount > post.comments.length ? (
                        <button
                          type="button"
                          onClick={() => void loadComments(post.id)}
                          className="text-xs font-semibold text-sky-800 hover:underline"
                        >
                          Ver todos os comentários
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-4 flex gap-2">
                    <input
                      aria-label={`Comentar publicação de ${post.author.name}`}
                      value={commentDrafts[post.id] || ""}
                      maxLength={1000}
                      onChange={(event) =>
                        setCommentDrafts((current) => ({
                          ...current,
                          [post.id]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void submitComment(post.id);
                        }
                      }}
                      placeholder="Escrever um comentário..."
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => void submitComment(post.id)}
                      disabled={busy || !commentDrafts[post.id]?.trim()}
                      className={secondaryButton}
                    >
                      Enviar
                    </button>
                  </div>
                </article>
              );
            })}
            {feedCursor ? (
              <button
                type="button"
                onClick={() => void loadFeed(feedCursor)}
                disabled={feedLoading}
                className={`${secondaryButton} w-full`}
              >
                Carregar publicações anteriores
              </button>
            ) : null}
          </div>
          <aside className="space-y-4 xl:sticky xl:top-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Canais da equipe
              </p>
              <h2 className="mt-1 font-bold text-slate-950">
                Converse por assunto
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use os canais para dúvidas rápidas e alinhamentos. Publique
                avisos que todos precisam encontrar depois no feed.
              </p>
              <button
                type="button"
                onClick={() => setTab("chat")}
                className={`${secondaryButton} mt-4 w-full`}
              >
                Abrir canais {totalUnread ? `· ${totalUnread} novas` : ""}
              </button>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50 p-5">
              <p className="font-bold text-sky-950">Comunicação clara</p>
              <p className="mt-2 text-sm leading-6 text-sky-900">
                Inclua contexto, responsável e próximo passo ao publicar uma
                decisão importante.
              </p>
            </div>
          </aside>
        </div>
      ) : (
        <section
          className="grid min-h-[min(72vh,760px)] overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm lg:grid-cols-[245px_minmax(0,1fr)]"
          aria-label="Canais de conversa"
        >
          <aside className="min-w-0 border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-2 px-4 py-4">
              <div>
                <h2 className="font-bold text-slate-950">Canais</h2>
                <p className="text-xs text-slate-600">Converse com a equipe</p>
              </div>
              {canModerate ? (
                <button
                  type="button"
                  title="Criar canal"
                  aria-label="Criar canal"
                  onClick={() => setShowNewChannel((value) => !value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-lg font-bold text-slate-700"
                >
                  +
                </button>
              ) : null}
            </div>
            {showNewChannel ? (
              <div className="space-y-2 border-y border-slate-200 bg-white p-3">
                <input
                  autoFocus
                  value={channelName}
                  onChange={(event) => setChannelName(event.target.value)}
                  maxLength={40}
                  placeholder="Nome do canal"
                  aria-label="Nome do canal"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={channelDescription}
                  onChange={(event) =>
                    setChannelDescription(event.target.value)
                  }
                  maxLength={160}
                  placeholder="Descrição (opcional)"
                  aria-label="Descrição do canal"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void createChannel()}
                  disabled={busy || !channelName.trim()}
                  className={`${primaryButton} w-full`}
                >
                  Criar canal
                </button>
              </div>
            ) : null}
            <div className="flex gap-1 overflow-x-auto px-2 pb-3 lg:block lg:space-y-1 lg:overflow-y-auto lg:px-2 lg:pb-4">
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => setActiveChannelId(channel.id)}
                  className={`min-w-[160px] rounded-xl px-3 py-3 text-left transition lg:w-full ${activeChannelId === channel.id ? "bg-[#17324c] text-white" : "text-slate-800 hover:bg-white"}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <strong className="truncate text-sm">
                      # {channel.name}
                    </strong>
                    {channel.unreadCount > 0 ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${activeChannelId === channel.id ? "bg-white text-slate-900" : "bg-rose-100 text-rose-800"}`}
                      >
                        {channel.unreadCount}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`mt-1 block truncate text-xs ${activeChannelId === channel.id ? "text-slate-200" : "text-slate-500"}`}
                  >
                    {channel.lastMessage?.body ||
                      channel.description ||
                      "Sem mensagens"}
                  </span>
                </button>
              ))}
              {channels.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-600">
                  Nenhum canal disponível.
                </p>
              ) : null}
            </div>
          </aside>
          <div className="flex min-h-[520px] min-w-0 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 md:px-5">
              <div className="min-w-0">
                <h2 className="truncate font-bold text-slate-950">
                  {activeChannel
                    ? `# ${activeChannel.name}`
                    : "Selecione um canal"}
                </h2>
                <p className="truncate text-xs text-slate-600">
                  {activeChannel?.description || "Conversa interna da equipe"}
                </p>
              </div>
              <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 sm:inline-flex">
                Atualização automática
              </span>
            </div>
            <div
              ref={chatScrollRef}
              role="log"
              aria-live="polite"
              aria-label="Mensagens do canal"
              className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] px-4 py-5 md:px-6"
            >
              {messageCursor ? (
                <button
                  type="button"
                  onClick={() =>
                    activeChannelId &&
                    void loadMessages(activeChannelId, messageCursor)
                  }
                  disabled={chatLoading}
                  className={`${secondaryButton} mx-auto block`}
                >
                  Carregar mensagens anteriores
                </button>
              ) : null}
              {chatLoading && !messages.length ? (
                <p className="py-8 text-center text-sm text-slate-600">
                  Carregando conversa...
                </p>
              ) : null}
              {!chatLoading && !messages.length && activeChannelId ? (
                <div className="py-12 text-center">
                  <p className="font-bold text-slate-900">
                    Este canal está pronto
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Envie a primeira mensagem para começar.
                  </p>
                </div>
              ) : null}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-start gap-2 ${message.author.id === meId ? "flex-row-reverse" : ""}`}
                >
                  <Avatar author={message.author} size="small" />
                  <div
                    className={`min-w-0 max-w-[min(86%,640px)] rounded-2xl px-4 py-3 shadow-sm ${message.author.id === meId ? "bg-[#e8f2fa]" : "border border-slate-200 bg-white"}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <strong className="text-xs text-slate-900">
                        {message.author.name}
                      </strong>
                      <span className="text-[11px] text-slate-500">
                        {timeLabel(message.createdAt)}
                        {message.editedAt ? " · editado" : ""}
                      </span>
                    </div>
                    {editingMessage === message.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          maxLength={2000}
                          rows={3}
                          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void saveEdit()}
                            disabled={busy || !editDraft.trim()}
                            className={secondaryButton}
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingMessage(null)}
                            className={secondaryButton}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                        {message.body}
                      </p>
                    )}
                    {editingMessage !== message.id &&
                    (message.canEdit || message.canDelete) ? (
                      <div className="mt-2 flex gap-3">
                        {message.canEdit ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessage(message.id);
                              setEditDraft(message.body);
                            }}
                            className="text-[11px] font-semibold text-sky-800 hover:underline"
                          >
                            Editar
                          </button>
                        ) : null}
                        {message.canDelete ? (
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({
                                kind: "message",
                                id: message.id,
                              })
                            }
                            className="text-[11px] font-semibold text-rose-700 hover:underline"
                          >
                            Excluir
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 bg-white p-3 md:p-4">
              <div className="flex items-end gap-2">
                <textarea
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  maxLength={2000}
                  rows={2}
                  disabled={!activeChannelId}
                  placeholder={
                    activeChannel
                      ? `Mensagem para #${activeChannel.name}`
                      : "Selecione um canal"
                  }
                  aria-label="Escrever mensagem"
                  className="min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={busy || !activeChannelId || !messageDraft.trim()}
                  className={primaryButton}
                >
                  Enviar
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Enter envia · Shift + Enter quebra a linha ·{" "}
                {messageDraft.length}/2000
              </p>
            </div>
          </div>
        </section>
      )}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleteTarget(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-delete-title"
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2
              id="team-delete-title"
              className="text-lg font-bold text-slate-950"
            >
              Remover conteúdo?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Esta ação retira o conteúdo da área da equipe.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={busy}
                className={primaryButton}
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
