export type EditingDraft = {
  id: string;
  revision: number;
  proposalId?: string | null;
  formData: Record<string, unknown>;
  updatedAt: string;
};
export type DraftBackup = Pick<EditingDraft, "id" | "revision" | "formData">;

// Newer server data must never silently replace unsaved local edits.
export function recoverEditingDraft(
  remote: EditingDraft,
  backup: DraftBackup | null,
  preferServer = false,
): DraftBackup & { conflict: boolean } {
  const local = backup?.id === remote.id ? backup : null;
  const conflict = Boolean(
    local &&
    local.revision !== remote.revision &&
    JSON.stringify(local.formData) !== JSON.stringify(remote.formData),
  );
  if (local && !preferServer && conflict) return { ...local, conflict: true };
  const formData =
    local && !preferServer && local.revision === remote.revision
      ? {
          ...local.formData,
          expectedUpdatedAt:
            remote.formData.expectedUpdatedAt ||
            local.formData.expectedUpdatedAt,
          editingProposalId:
            remote.proposalId || local.formData.editingProposalId || "",
        }
      : {
          ...remote.formData,
          editingProposalId:
            remote.proposalId || remote.formData.editingProposalId || "",
        };
  return {
    id: remote.id,
    revision: remote.revision,
    formData,
    conflict: false,
  };
}

export function persistDraftBackup(
  storage: Pick<Storage, "setItem">,
  key: string,
  backup: DraftBackup,
  completed: boolean,
) {
  if (!completed) storage.setItem(key, JSON.stringify(backup));
}
