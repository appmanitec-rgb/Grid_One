import { expect, test } from "@playwright/test";
import {
  recoverEditingDraft,
  persistDraftBackup,
} from "../app/dashboard/proposals/new/draft-recovery";

const remote = {
  id: "own-draft",
  revision: 3,
  updatedAt: "2026-10-23T15:00:00Z",
  proposalId: "proposal",
  formData: { scope: "Server edit", expectedUpdatedAt: "saved-baseline" },
};

test("another tab cannot silently replace local edits on recovery", () => {
  const backup = {
    id: remote.id,
    revision: 2,
    formData: {
      scope: "Unsaved local edit",
      expectedUpdatedAt: "old-baseline",
    },
  };
  expect(recoverEditingDraft(remote, backup)).toEqual({
    ...backup,
    conflict: true,
  });
  expect(recoverEditingDraft(remote, backup, true)).toEqual({
    id: remote.id,
    revision: 3,
    conflict: false,
    formData: { ...remote.formData, editingProposalId: "proposal" },
  });
});

test("same revision keeps the last keystroke and authoritative baseline", () => {
  const backup = {
    id: remote.id,
    revision: 3,
    formData: { scope: "Last keystroke", expectedUpdatedAt: "old-baseline" },
  };
  expect(recoverEditingDraft(remote, backup).formData).toEqual({
    scope: "Last keystroke",
    expectedUpdatedAt: "saved-baseline",
    editingProposalId: "proposal",
  });
});

test("foreign backup cannot replace this draft", () => {
  expect(
    recoverEditingDraft(remote, {
      id: "other-draft",
      revision: 2,
      formData: { scope: "Foreign edit" },
    }).formData.scope,
  ).toBe("Server edit");
});

test("completion suppresses delayed backup and navigation cleanup writes", () => {
  const writes: string[] = [];
  const storage = {
    setItem: (key: string, value: string) => {
      writes.push(key + value);
    },
  };
  const backup = { id: remote.id, revision: 3, formData: remote.formData };
  persistDraftBackup(storage, "own-key", backup, false);
  expect(writes).toHaveLength(1);
  persistDraftBackup(storage, "own-key", backup, true);
  persistDraftBackup(storage, "own-key", backup, true);
  expect(writes).toHaveLength(1);
});
