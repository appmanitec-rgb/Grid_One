export const KANBAN_COLUMNS: Array<{ key: string; label: string; tone: string }> = [
  { key: "DRAFT", label: "Rascunho", tone: "from-zinc-100 to-zinc-200" },
  { key: "BOARD_REVIEW", label: "Analise Diretoria", tone: "from-cyan-100 to-cyan-200" },
  { key: "REVISION_REQUIRED", label: "Ajustes solicitados", tone: "from-amber-100 to-amber-200" },
  { key: "CLIENT_REVIEW", label: "Analise Cliente", tone: "from-indigo-100 to-indigo-200" },
  { key: "WON", label: "Ganho", tone: "from-emerald-100 to-emerald-200" },
  { key: "LOST", label: "Perdido", tone: "from-rose-100 to-rose-200" },
  { key: "REJECTED", label: "Reprovadas", tone: "from-rose-100 to-red-200" },
  { key: "REVISED", label: "Revisadas", tone: "from-slate-100 to-slate-200" },
];

export const FLOW_STEPS = [
  { key: "DRAFT", label: "Rascunho" },
  { key: "BOARD_REVIEW", label: "Diretoria" },
  { key: "CLIENT_REVIEW", label: "Cliente" },
  { key: "WON", label: "Ganho" },
  { key: "LOST", label: "Perdido" },
];

export const COMMON_USER_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["BOARD_REVIEW"],
  BOARD_REVIEW: ["CLIENT_REVIEW"],
  REVISION_REQUIRED: [],
  CLIENT_REVIEW: ["WON", "LOST"],
  WON: [],
  LOST: [],
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  BOARD_REVIEW: "Analise da Diretoria",
  REVISION_REQUIRED: "Ajustes solicitados pela Diretoria",
  REVISED: "Revisada",
  CLIENT_REVIEW: "Analise do Cliente",
  WON: "Aprovado pelo Cliente (Ganho)",
  LOST: "Reprovado pelo Cliente (Perdido)",
  APPROVED: "Aprovado",
  REJECTED: "Reprovada pela Diretoria",
  SENT: "Enviado",
};

export function canMoveForward(currentStatus: string, nextStatus: string) {
  return (COMMON_USER_TRANSITIONS[currentStatus] || []).includes(nextStatus);
}

export function statusLabel(status: string) {
  return STATUS_LABELS[status] || status;
}

export function statusToFlowStep(status: string) {
  return status;
}

