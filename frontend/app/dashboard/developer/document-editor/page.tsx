"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import { apiFetch, readApiErrorMessage } from "@/lib/api";

type Kind = "PROPOSAL" | "CONTRACT" | "SERVICE_REPORT";
type Segment = { type: "text"; text: string } | { type: "field"; fieldId: string };
type Block = {
  id: string;
  type: "paragraph" | "heading" | "spacer";
  segments: Segment[];
  fontSize: number;
  bold: boolean;
  align: "left" | "center" | "right";
  spaceAfter: number;
};
type Field = { id: string; label: string; category: string; kinds: Kind[]; isSystem: boolean };
type TemplateSummary = { id: string; kind: Kind; name: string; description: string | null; isActive: boolean; currentVersion: number; publishedVersion: number | null; updatedAt: string };
type Version = { versionNumber: number; format: "VISUAL" | "WORD"; blocks: Block[]; changeSummary: string | null; createdAt: string };
type TemplateDetail = TemplateSummary & { versions: Version[] };
type SampleRecord = { id: string; label: string };
type WordField = { label: string; category: string };
type Cursor = { blockId: string; segmentIndex: number; start: number; end: number };

const API = "/studio/document-editor";
const KINDS: Array<{ value: Kind; label: string; hint: string }> = [
  { value: "PROPOSAL", label: "Propostas", hint: "Apresentação comercial e valores" },
  { value: "CONTRACT", label: "Contratos", hint: "Condições e vigência" },
  { value: "SERVICE_REPORT", label: "Relatórios", hint: "Atendimento e diagnóstico" },
];
const button = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40";
const primary = "rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40";

function createBlock(type: Block["type"] = "paragraph"): Block {
  const blockId = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return {
    id: blockId,
    type,
    segments: type === "spacer" ? [] : [{ type: "text", text: "" }],
    fontSize: type === "heading" ? 18 : 11,
    bold: type === "heading",
    align: "left",
    spaceAfter: type === "spacer" ? 24 : 8,
  };
}

function initialBlocks(): Block[] {
  return [createBlock("heading"), createBlock("paragraph")];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API}${path}`, init);
  if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível concluir a operação."));
  return response.json() as Promise<T>;
}

export default function DocumentEditorPage() {
  const [access, setAccess] = useState(() => getAccessFromToken());
  const canEdit = access.studio.dataEdit;
  const canView = access.studio.access && access.studio.dataView;
  const [kind, setKind] = useState<Kind>("PROPOSAL");
  const [fields, setFields] = useState<Field[]>([]);
  const [wordFields, setWordFields] = useState<WordField[]>([]);
  const [showVisualBuilder, setShowVisualBuilder] = useState(false);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [samples, setSamples] = useState<SampleRecord[]>([]);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [recordId, setRecordId] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [fieldQuery, setFieldQuery] = useState("");
  const [fieldFormOpen, setFieldFormOpen] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldSource, setNewFieldSource] = useState("");
  const [newFieldFixed, setNewFieldFixed] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const cursorRef = useRef<Cursor | null>(null);
  const dragRef = useRef<string | null>(null);
  const wordInputRef = useRef<HTMLInputElement | null>(null);
  const wordMode = template?.versions[0]?.format === "WORD";

  useEffect(() => setAccess(getAccessFromToken()), []);

  const loadCatalog = useCallback(async (nextKind: Kind) => {
    setLoading(true);
    try {
      const [nextFields, nextTemplates, nextSamples, nextWordFields] = await Promise.all([
        request<Field[]>(`/fields?kind=${nextKind}`),
        request<TemplateSummary[]>(`/templates?kind=${nextKind}`),
        request<SampleRecord[]>(`/sample-records?kind=${nextKind}`),
        request<WordField[]>(`/word-fields?kind=${nextKind}`),
      ]);
      setFields(nextFields);
      setTemplates(nextTemplates);
      setSamples(nextSamples);
      setWordFields(nextWordFields);
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao carregar o editor." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCatalog(kind); }, [kind, loadCatalog]);

  const fieldById = useMemo(() => new Map(fields.map((field) => [field.id, field])), [fields]);
  const groupedFields = useMemo(() => {
    const term = fieldQuery.trim().toLocaleLowerCase("pt-BR");
    const filtered = fields.filter((field) => `${field.label} ${field.category}`.toLocaleLowerCase("pt-BR").includes(term));
    return [...new Set(filtered.map((field) => field.category))].map((category) => ({ category, fields: filtered.filter((field) => field.category === category) }));
  }, [fields, fieldQuery]);
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) || null;

  useEffect(() => {
    if (!canView || loading || wordMode || blocks.length === 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewBusy(true);
      try {
        const result = await request<{ html: string }>("/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, blocks, recordId: recordId || undefined }),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setPreviewHtml(result.html);
      } catch (error) {
        if (!controller.signal.aborted) setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha na prévia." });
      } finally {
        if (!controller.signal.aborted) setPreviewBusy(false);
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [kind, blocks, recordId, canView, loading, wordMode]);

  function reset(nextKind = kind) {
    if (dirty && !window.confirm("Há alterações não salvas. Deseja sair deste modelo?")) return;
    setKind(nextKind);
    if (nextKind !== kind) { setFields([]); setTemplates([]); setSamples([]); setWordFields([]); }
    setTemplate(null);
    setName("");
    setDescription("");
    setBlocks(initialBlocks());
    setSelectedBlockId("");
    setRecordId("");
    setDirty(false);
    setHistoryOpen(false);
    setShowVisualBuilder(false);
    cursorRef.current = null;
  }

  async function openTemplate(id: string) {
    if (dirty && !window.confirm("Há alterações não salvas. Deseja abrir outro modelo?")) return;
    setBusy(true);
    try {
      const loaded = await request<TemplateDetail>(`/templates/${id}`);
      setTemplate(loaded);
      setName(loaded.name);
      setDescription(loaded.description || "");
      setBlocks(loaded.versions[0]?.blocks || initialBlocks());
      setShowVisualBuilder(loaded.versions[0]?.format !== "WORD");
      setSelectedBlockId("");
      setDirty(false);
      setHistoryOpen(false);
      setFeedback(null);
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Modelo não encontrado." });
    } finally { setBusy(false); }
  }

  function changeBlocks(update: (current: Block[]) => Block[]) {
    setBlocks(update);
    setDirty(true);
  }

  function editBlock(id: string, patch: Partial<Block>) {
    changeBlocks((current) => current.map((block) => block.id === id ? { ...block, ...patch } : block));
  }

  function editText(blockId: string, segmentIndex: number, text: string) {
    changeBlocks((current) => current.map((block) => block.id === blockId ? {
      ...block,
      segments: block.segments.map((segment, index) => index === segmentIndex ? { type: "text", text } : segment),
    } : block));
  }

  function rememberCursor(blockId: string, segmentIndex: number, element: HTMLTextAreaElement) {
    cursorRef.current = { blockId, segmentIndex, start: element.selectionStart, end: element.selectionEnd };
    setSelectedBlockId(blockId);
  }

  function insertField(field: Field) {
    if (!canEdit) return;
    const targetId = [cursorRef.current?.blockId, selectedBlockId].find((id) => blocks.some((block) => block.id === id && block.type !== "spacer")) || blocks.find((block) => block.type !== "spacer")?.id;
    if (!targetId) return;
    changeBlocks((current) => current.map((block) => {
      if (block.id !== targetId || block.type === "spacer") return block;
      const position = cursorRef.current?.blockId === targetId ? cursorRef.current : null;
      const index = position?.segmentIndex ?? block.segments.length - 1;
      const segment = block.segments[index];
      const text = segment?.type === "text" ? segment.text : "";
      const start = position ? Math.min(position.start, text.length) : text.length;
      const end = position ? Math.min(position.end, text.length) : text.length;
      const before = block.segments.slice(0, index);
      const after = block.segments.slice(index + 1);
      return {
        ...block,
        segments: [...before, { type: "text", text: text.slice(0, start) }, { type: "field", fieldId: field.id }, { type: "text", text: text.slice(end) }, ...after] as Segment[],
      };
    }));
    cursorRef.current = null;
    setSelectedBlockId(targetId);
  }

  function removeField(blockId: string, segmentIndex: number) {
    changeBlocks((current) => current.map((block) => block.id === blockId ? {
      ...block,
      segments: block.segments.filter((_, index) => index !== segmentIndex),
    } : block));
  }

  function moveBlock(id: string, toIndex: number) {
    changeBlocks((current) => {
      const source = current.findIndex((block) => block.id === id);
      if (source < 0 || toIndex < 0 || toIndex >= current.length || source === toIndex) return current;
      const next = [...current];
      const [item] = next.splice(source, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }

  async function save() {
    if (!name.trim()) { setFeedback({ kind: "error", text: "Dê um nome ao modelo." }); return; }
    setBusy(true);
    setFeedback(null);
    try {
      const loaded = template
        ? await request<TemplateDetail>(`/templates/${template.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description, blocks, expectedVersion: template.currentVersion, changeSummary: "Edição visual" }) })
        : await request<TemplateDetail>("/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, name, description, blocks }) });
      setTemplate(loaded);
      setDirty(false);
      setFeedback({ kind: "success", text: `Versão ${loaded.currentVersion} salva. Publique quando a prévia estiver pronta.` });
      void loadCatalog(kind);
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao salvar." });
    } finally { setBusy(false); }
  }

  async function act(action: "publish" | "deactivate" | "duplicate", version?: number) {
    if (!template) return;
    setBusy(true);
    try {
      const path = version ? `/templates/${template.id}/restore/${version}` : `/templates/${template.id}/${action}`;
      const loaded = await request<TemplateDetail>(path, { method: "POST" });
      setTemplate(loaded);
      setName(loaded.name);
      setDescription(loaded.description || "");
      setBlocks(loaded.versions[0]?.blocks || initialBlocks());
      setShowVisualBuilder(loaded.versions[0]?.format !== "WORD");
      setDirty(false);
      setFeedback({ kind: "success", text: version ? `Versão ${version} restaurada como novo rascunho.` : action === "publish" ? "Modelo publicado e aplicado aos próximos documentos." : action === "duplicate" ? "Cópia criada como rascunho." : "Modelo desativado." });
      void loadCatalog(kind);
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Operação não concluída." });
    } finally { setBusy(false); }
  }

  async function createField() {
    setBusy(true);
    try {
      const created = await request<Field>("/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, label: newFieldLabel, sourceFieldId: newFieldSource || undefined, fixedValue: newFieldSource ? undefined : newFieldFixed || undefined }) });
      setFields((current) => [...current, created].sort((a, b) => `${a.category}${a.label}`.localeCompare(`${b.category}${b.label}`, "pt-BR")));
      setNewFieldLabel(""); setNewFieldSource(""); setNewFieldFixed(""); setFieldFormOpen(false);
      setFeedback({ kind: "success", text: `Campo “${created.label}” adicionado à biblioteca.` });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao criar campo." });
    } finally { setBusy(false); }
  }

  async function downloadWord(path: string, filename: string) {
    setBusy(true);
    try {
      const response = await apiFetch(`${API}${path}`);
      if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível baixar o Word."));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao baixar o Word." });
    } finally { setBusy(false); }
  }

  async function uploadWord(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) { setFeedback({ kind: "error", text: "Selecione um arquivo .docx." }); return; }
    if (!template && !name.trim()) { setFeedback({ kind: "error", text: "Dê um nome ao modelo antes de enviar o Word." }); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file); form.append("name", name || template?.name || "Modelo Word");
      if (template) form.append("expectedVersion", String(template.currentVersion));
      else form.append("kind", kind);
      const loaded = await request<TemplateDetail>(template ? `/templates/${template.id}/word` : "/word-templates", { method: "POST", body: form });
      setTemplate(loaded); setName(loaded.name); setBlocks(loaded.versions[0]?.blocks || []);
      setShowVisualBuilder(false);
      setDirty(false); setFeedback({ kind: "success", text: `Word enviado como versão ${loaded.currentVersion}. Baixe a prévia preenchida e publique quando estiver pronto.` });
      void loadCatalog(kind);
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível enviar o Word." });
    } finally {
      setBusy(false);
      if (wordInputRef.current) wordInputRef.current.value = "";
    }
  }

  async function copyWordField(label: string) {
    if (!navigator.clipboard?.writeText) {
      setFeedback({ kind: "error", text: `Copie o campo «${label}» e cole no Word.` });
      return;
    }
    try {
      await navigator.clipboard.writeText(`«${label}»`);
      setFeedback({ kind: "success", text: `Campo “${label}” copiado. Cole no Word.` });
    } catch {
      setFeedback({ kind: "error", text: `Copie o campo «${label}» e cole no Word.` });
    }
  }

  if (!canView) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm font-semibold text-amber-900">Seu perfil precisa de acesso de visualização ao Manitec Studio.</div>;

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">Manitec Studio · Documentos</p>
            <h1 className="mt-2 text-3xl font-bold">Editor Inteligente de Documentos</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Monte seu documento com texto e campos prontos. A prévia mostra o resultado antes de publicar.</p>
          </div>
          <Link href="/dashboard/developer/data" className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">Voltar ao Studio</Link>
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {KINDS.map((option) => <button key={option.value} type="button" onClick={() => { if (option.value !== kind) reset(option.value); }} className={`rounded-xl border p-3 text-left transition ${kind === option.value ? "border-blue-300 bg-blue-600 text-white" : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"}`}><span className="block font-bold">{option.label}</span><span className="mt-1 block text-xs opacity-80">{option.hint}</span></button>)}
        </div>
      </header>

      {feedback ? <div role="status" className={`rounded-xl border px-4 py-3 text-sm font-semibold ${feedback.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{feedback.text}</div> : null}

      <section className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Modelo Word da MANITEC</p><h2 className="mt-1 text-xl font-bold text-slate-900">Edite o documento que vocês já usam</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Baixe uma cópia do Word original, altere textos, tabelas, imagens e formatação no Word e envie o arquivo aqui. Os campos com nomes legíveis serão preenchidos automaticamente na geração.</p></div>
          <button type="button" disabled={busy} onClick={() => void downloadWord(`/word-base?kind=${kind}`, `modelo-${kind.toLowerCase()}-editavel.docx`)} className={primary}>1. Baixar Word original</button>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-bold text-slate-900">2. Enviar o Word editado</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">O arquivo enviado vira uma nova versão deste modelo. A versão publicada continua em uso até você publicar a nova.</p>
            {!template ? <label className="mt-3 block text-xs font-semibold text-slate-600">Nome do modelo<input value={name} onChange={(event) => { setName(event.target.value); setDirty(true); }} placeholder="Ex.: Proposta comercial padrão" className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm" /></label> : <p className="mt-3 text-sm font-bold text-slate-800">{template.name} · versão {template.currentVersion}</p>}
            <input ref={wordInputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={!canEdit || busy} onChange={(event) => void uploadWord(event.target.files?.[0])} className="mt-3 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-100 file:px-3 file:py-2 file:font-bold file:text-blue-900" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-bold text-slate-900">Campos para copiar no Word</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">Clique em um campo e cole no local desejado do documento. Você verá apenas o nome do dado.</p>
            <input type="search" value={fieldQuery} onChange={(event) => setFieldQuery(event.target.value)} placeholder="Buscar nome, valor, data…" className="mt-3 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" />
            <div className="mt-2 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">{wordFields.filter((field) => `${field.label} ${field.category}`.toLocaleLowerCase("pt-BR").includes(fieldQuery.toLocaleLowerCase("pt-BR"))).map((field) => <button key={`${field.category}-${field.label}`} type="button" onClick={() => void copyWordField(field.label)} className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-semibold text-blue-900 hover:bg-blue-50" title={`Copiar ${field.label}`}>«{field.label}»</button>)}</div>
          </div>
        </div>
        <div className="mt-4 border-t border-slate-200 pt-4"><h3 className="text-sm font-bold text-slate-900">Modelos salvos</h3><div className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto">{templates.length ? templates.map((item) => <button key={item.id} type="button" onClick={() => void openTemplate(item.id)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${template?.id === item.id ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>{item.name}{item.isActive ? " · publicado" : ""}</button>) : <span className="text-xs text-slate-500">Nenhum modelo salvo nesta categoria.</span>}</div></div>
        {wordMode && template ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-emerald-950">Versão Word {template.currentVersion} pronta para conferência</p><p className="mt-1 text-xs text-emerald-900">Confira o arquivo preenchido com um exemplo ou um cadastro real antes de publicar.</p></div><button type="button" onClick={() => reset()} className={button}>Ver outros modelos</button></div>
          <div className="mt-3 flex flex-wrap items-end gap-2"><label className="min-w-[240px] flex-1 text-xs font-semibold text-slate-600">Dados para prévia<select value={recordId} onChange={(event) => setRecordId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"><option value="">Exemplo demonstrativo</option>{samples.map((sample) => <option key={sample.id} value={sample.id}>{sample.label}</option>)}</select></label><button type="button" disabled={busy} onClick={() => void downloadWord(`/templates/${template.id}/word`, `modelo-${kind.toLowerCase()}-v${template.currentVersion}.docx`)} className={button}>Baixar esta versão</button><button type="button" disabled={busy} onClick={() => void downloadWord(`/templates/${template.id}/word-preview${recordId ? `?recordId=${encodeURIComponent(recordId)}` : ""}`, "previa-preenchida.docx")} className={button}>Prévia preenchida em Word</button><button type="button" disabled={busy} onClick={() => void downloadWord(`/templates/${template.id}/word-preview?format=pdf${recordId ? `&recordId=${encodeURIComponent(recordId)}` : ""}`, "previa-preenchida.pdf")} className={button}>Prévia em PDF</button></div>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!canEdit || busy || template.isActive && template.publishedVersion === template.currentVersion} onClick={() => void act("publish")} className={primary}>Publicar versão Word</button><button type="button" disabled={!canEdit || busy} onClick={() => void act("duplicate")} className={button}>Duplicar modelo</button><button type="button" disabled={!canEdit || busy || !template.isActive} onClick={() => void act("deactivate")} className={button}>Desativar</button><button type="button" onClick={() => setHistoryOpen((value) => !value)} className={button}>Histórico</button></div>
          {historyOpen ? <div className="mt-3 space-y-2">{template.versions.map((version) => <div key={version.versionNumber} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white p-2 text-sm"><span>Versão {version.versionNumber} · {version.format === "WORD" ? "Word" : "Visual"} · {new Date(version.createdAt).toLocaleString("pt-BR")}</span><button type="button" disabled={!canEdit || busy || version.versionNumber === template.currentVersion} onClick={() => void act("publish", version.versionNumber)} className={button}>Restaurar</button></div>)}</div> : null}
        </div> : null}
      </section>

      {!wordMode ? <button type="button" onClick={() => setShowVisualBuilder((value) => !value)} className={button}>{showVisualBuilder ? "Recolher editor visual" : "Criar documento do zero no editor visual"}</button> : null}
      <div className={`${wordMode || !showVisualBuilder ? "hidden" : "grid"} items-start gap-5 xl:grid-cols-[245px_minmax(0,1fr)_330px]`}>
        <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Modelos</h2><button type="button" onClick={() => reset()} disabled={!canEdit} className="text-xs font-bold text-blue-700 disabled:opacity-40">+ Novo</button></div>
          <p className="text-xs leading-5 text-slate-500">Publique um modelo para usá-lo nos próximos documentos desse tipo.</p>
          <div className="space-y-2">
            {loading ? <p className="text-sm text-slate-500">Carregando…</p> : templates.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Nenhum modelo criado.</p> : templates.map((item) => <button key={item.id} type="button" onClick={() => void openTemplate(item.id)} className={`w-full rounded-xl border p-3 text-left transition ${template?.id === item.id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-200"}`}><span className="block text-sm font-bold text-slate-900">{item.name}</span><span className="mt-1 flex items-center gap-2 text-xs text-slate-500">v{item.currentVersion}<span className={item.isActive ? "rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800" : "rounded-full bg-slate-100 px-2 py-0.5"}>{item.isActive ? "Publicado" : "Rascunho"}</span></span></button>)}
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">{template ? "Editar modelo" : "Novo modelo"}</h2><p className="text-xs text-slate-500">Escreva livremente e clique nos campos da biblioteca para inserir dados.</p></div>{template ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">v{template.currentVersion}{dirty ? " · não salvo" : ""}</span> : null}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr]"><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nome do modelo<input value={name} disabled={!canEdit} onChange={(event) => { setName(event.target.value); setDirty(true); }} placeholder="Ex.: Proposta de manutenção" className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm font-medium normal-case text-slate-900" /></label><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Descrição opcional<input value={description} disabled={!canEdit} onChange={(event) => { setDescription(event.target.value); setDirty(true); }} placeholder="Quando usar este modelo" className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm font-medium normal-case text-slate-900" /></label></div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-100 p-3 shadow-sm sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold text-slate-900">Página do documento</h2><p className="text-xs text-slate-500">Clique no texto para posicionar o cursor. Os campos azuis são preenchidos automaticamente.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={!canEdit} onClick={() => { const block = createBlock("heading"); changeBlocks((current) => [...current, block]); setSelectedBlockId(block.id); }} className={button}>+ Título</button><button type="button" disabled={!canEdit} onClick={() => { const block = createBlock(); changeBlocks((current) => [...current, block]); setSelectedBlockId(block.id); }} className={button}>+ Texto</button><button type="button" disabled={!canEdit} onClick={() => changeBlocks((current) => [...current, createBlock("spacer")])} className={button}>+ Espaço</button></div></div>
            <div className="min-h-[560px] space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-inner sm:p-7">
              <div className="mb-5 border-b-2 border-blue-600 pb-3 text-sm font-black tracking-wide text-slate-800">MANITEC <span className="font-medium text-slate-500">OPERAÇÃO INTEGRADA</span></div>
              {blocks.map((block, index) => <div key={block.id} onClick={() => setSelectedBlockId(block.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (dragRef.current) moveBlock(dragRef.current, index); dragRef.current = null; }} className={`group rounded-xl border p-2 transition ${selectedBlockId === block.id ? "border-blue-300 bg-blue-50/30" : "border-transparent hover:border-slate-200"}`}>
                <div className="mb-1 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><button type="button" draggable={canEdit} onDragStart={() => { dragRef.current = block.id; }} title="Arrastar para mudar a ordem" className="cursor-grab text-slate-400">⠿</button><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{block.type === "heading" ? "Título" : block.type === "spacer" ? "Espaço" : "Texto"}</span></div><div className="flex gap-1 opacity-70 group-hover:opacity-100"><button type="button" disabled={!canEdit || index === 0} onClick={() => moveBlock(block.id, index - 1)} className="px-1 text-xs text-slate-500 disabled:opacity-30" title="Mover para cima">↑</button><button type="button" disabled={!canEdit || index === blocks.length - 1} onClick={() => moveBlock(block.id, index + 1)} className="px-1 text-xs text-slate-500 disabled:opacity-30" title="Mover para baixo">↓</button><button type="button" disabled={!canEdit || blocks.length === 1} onClick={() => changeBlocks((current) => current.filter((entry) => entry.id !== block.id))} className="px-1 text-xs text-red-500 disabled:opacity-30" title="Excluir bloco">✕</button></div></div>
                {block.type === "spacer" ? <div className="flex h-8 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">Espaçamento de {block.spaceAfter}px</div> : <div className="flex flex-wrap items-center gap-y-1" style={{ fontSize: block.fontSize, fontWeight: block.bold ? 700 : 400, textAlign: block.align }}>
                  {block.segments.map((segment, segmentIndex) => segment.type === "field" ? <span key={`${block.id}-${segmentIndex}`} className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-100 px-2 py-1 text-xs font-bold text-blue-900">{fieldById.get(segment.fieldId)?.label || "Campo removido"}<button type="button" disabled={!canEdit} title="Remover campo" onClick={(event) => { event.stopPropagation(); removeField(block.id, segmentIndex); }} className="text-blue-600 disabled:hidden">×</button></span> : <textarea key={`${block.id}-${segmentIndex}`} rows={Math.max(1, segment.text.split("\n").length)} value={segment.text} disabled={!canEdit} placeholder={block.type === "heading" ? "Escreva um título…" : "Escreva aqui…"} onChange={(event) => editText(block.id, segmentIndex, event.target.value)} onSelect={(event) => rememberCursor(block.id, segmentIndex, event.currentTarget)} onFocus={(event) => rememberCursor(block.id, segmentIndex, event.currentTarget)} className="min-w-[100px] flex-1 resize-y border-0 bg-transparent p-1 outline-none placeholder:text-slate-300 focus:ring-1 focus:ring-blue-300" style={{ fontSize: block.fontSize, fontWeight: block.bold ? 700 : 400, textAlign: block.align }} />)}
                </div>}
              </div>)}
            </div>
          </section>

          {selectedBlock ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-sm font-bold text-slate-900">Aparência do bloco</h3><div className="mt-3 flex flex-wrap items-end gap-3"><label className="text-xs font-semibold text-slate-500">Tamanho<input type="number" min="8" max="32" value={selectedBlock.fontSize} disabled={!canEdit} onChange={(event) => editBlock(selectedBlock.id, { fontSize: Number(event.target.value) })} className="mt-1 block w-20 rounded-lg border border-slate-300 p-2 text-sm" /></label><label className="text-xs font-semibold text-slate-500">Espaço após<input type="number" min="0" max="48" value={selectedBlock.spaceAfter} disabled={!canEdit} onChange={(event) => editBlock(selectedBlock.id, { spaceAfter: Number(event.target.value) })} className="mt-1 block w-24 rounded-lg border border-slate-300 p-2 text-sm" /></label><button type="button" disabled={!canEdit} onClick={() => editBlock(selectedBlock.id, { bold: !selectedBlock.bold })} className={`${button} ${selectedBlock.bold ? "border-blue-400 bg-blue-50 text-blue-800" : ""}`}>Negrito</button><select value={selectedBlock.align} disabled={!canEdit} onChange={(event) => editBlock(selectedBlock.id, { align: event.target.value as Block["align"] })} className="rounded-xl border border-slate-300 p-2 text-sm"><option value="left">À esquerda</option><option value="center">Centralizado</option><option value="right">À direita</option></select></div></section> : null}

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><button type="button" disabled={!canEdit || busy || !dirty && Boolean(template)} onClick={() => void save()} className={primary}>{busy ? "Salvando…" : template ? "Salvar nova versão" : "Criar modelo"}</button>{template ? <><button type="button" disabled={!canEdit || busy || dirty || template.publishedVersion === template.currentVersion && template.isActive} onClick={() => void act("publish")} className={button}>Publicar versão {template.currentVersion}</button><button type="button" disabled={!canEdit || busy} onClick={() => void act("duplicate")} className={button}>Duplicar</button><button type="button" disabled={!canEdit || busy || !template.isActive} onClick={() => void act("deactivate")} className={button}>Desativar</button><button type="button" onClick={() => setHistoryOpen((value) => !value)} className={button}>Histórico</button></> : null}</div>
          {template && historyOpen ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="font-bold text-slate-900">Versões anteriores</h3><div className="mt-3 space-y-2">{template.versions.map((version) => <div key={version.versionNumber} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm"><div><span className="font-bold">Versão {version.versionNumber}</span>{template.publishedVersion === version.versionNumber && template.isActive ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">Publicada</span> : null}<p className="text-xs text-slate-500">{new Date(version.createdAt).toLocaleString("pt-BR")} · {version.changeSummary || "Criação ou edição"}</p></div><button type="button" disabled={!canEdit || busy || dirty || version.versionNumber === template.currentVersion} onClick={() => void act("publish", version.versionNumber)} className={button}>Restaurar</button></div>)}</div></section> : null}
        </main>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><div><h2 className="font-bold text-slate-900">Biblioteca de campos</h2><p className="text-xs text-slate-500">Posicione o cursor no texto e clique no campo.</p></div><button type="button" disabled={!canEdit} onClick={() => setFieldFormOpen((value) => !value)} className="text-xs font-bold text-blue-700 disabled:opacity-40">+ Criar</button></div><input type="search" value={fieldQuery} onChange={(event) => setFieldQuery(event.target.value)} placeholder="Buscar nome, data, valor…" className="mt-3 w-full rounded-xl border border-slate-300 p-2.5 text-sm" /><div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">{groupedFields.map((group) => <div key={group.category}><p className="mb-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">{group.category}</p><div className="flex flex-wrap gap-1.5">{group.fields.map((field) => <button type="button" key={field.id} disabled={!canEdit} onClick={() => insertField(field)} className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-left text-xs font-semibold text-blue-900 hover:border-blue-300 hover:bg-blue-100 disabled:opacity-50" title={`Inserir ${field.label}`}>{field.label}</button>)}</div></div>)}</div>
            {fieldFormOpen ? <div className="mt-4 space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3"><h3 className="text-sm font-bold text-blue-900">Novo campo amigável</h3><input value={newFieldLabel} onChange={(event) => setNewFieldLabel(event.target.value)} placeholder="Nome visível do campo" className="w-full rounded-lg border border-blue-200 p-2 text-sm" /><select value={newFieldSource} onChange={(event) => setNewFieldSource(event.target.value)} className="w-full rounded-lg border border-blue-200 p-2 text-sm"><option value="">Texto fixo informado abaixo</option>{fields.map((field) => <option key={field.id} value={field.id}>Mesmo dado de: {field.label}</option>)}</select>{!newFieldSource ? <textarea value={newFieldFixed} onChange={(event) => setNewFieldFixed(event.target.value)} rows={2} placeholder="Texto que aparecerá no documento" className="w-full rounded-lg border border-blue-200 p-2 text-sm" /> : null}<button type="button" disabled={busy || !newFieldLabel.trim() || !newFieldSource && !newFieldFixed.trim()} onClick={() => void createField()} className={primary}>Adicionar à biblioteca</button></div> : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><div><h2 className="font-bold text-slate-900">Prévia inteligente</h2><p className="text-xs text-slate-500">Veja o documento preenchido antes de publicar.</p></div>{previewBusy ? <span className="text-xs text-blue-600">Atualizando…</span> : null}</div><label className="mt-3 block text-xs font-bold text-slate-600">Dados para a prévia<select value={recordId} onChange={(event) => setRecordId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm font-normal"><option value="">Exemplo demonstrativo</option>{samples.map((sample) => <option key={sample.id} value={sample.id}>{sample.label}</option>)}</select></label><p className="mt-2 text-xs text-slate-500">{recordId ? "Dados do cadastro selecionado." : "Use um cadastro existente acima para conferir com dados reais."}</p><div className="mt-3 h-[520px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><iframe title="Prévia do documento" srcDoc={previewHtml} sandbox="" className="h-full w-full bg-white" /></div></section>
        </aside>
      </div>
    </div>
  );
}
