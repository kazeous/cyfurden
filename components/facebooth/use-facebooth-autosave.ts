"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createFaceboothProjectAction,
  saveFaceboothProjectAction,
} from "@/app/manage/[boothId]/facebooth/actions";
import {
  deleteFaceboothDraft,
  readFaceboothDraft,
  writeFaceboothDraft,
  type FaceboothRecoveryDraft,
} from "@/lib/facebooth-drafts";
import type {
  FaceboothProjectDocument,
  FaceboothProjectKind,
} from "@/lib/facebooth-documents";

export type FaceboothSaveState =
  | "SAVED"
  | "DIRTY"
  | "SAVING"
  | "OFFLINE"
  | "ERROR"
  | "CONFLICT";

export function useFaceboothAutosave<
  TDocument extends FaceboothProjectDocument,
>(input: {
  boothId: string;
  kind: FaceboothProjectKind;
  initialProject: {
    id: string;
    name: string;
    editVersion: number;
    document: TDocument;
  };
  parseDocument: (value: unknown) => TDocument | null;
  copyName: (name: string) => string;
}) {
  const { boothId, initialProject, kind, parseDocument, copyName } = input;
  const projectId = initialProject.id;
  const [document, setDocumentState] = useState(initialProject.document);
  const [name, setNameState] = useState(initialProject.name);
  const [editVersion, setEditVersion] = useState(initialProject.editVersion);
  const [saveState, setSaveState] = useState<FaceboothSaveState>("SAVED");
  const [message, setMessage] = useState("");
  const [recoveryDraft, setRecoveryDraft] =
    useState<FaceboothRecoveryDraft | null>(null);
  const documentRef = useRef<TDocument>(initialProject.document);
  const nameRef = useRef(initialProject.name);
  const editVersionRef = useRef(initialProject.editVersion);
  const localRevisionRef = useRef(0);
  const savingRef = useRef(false);

  const markChanged = useCallback(() => {
    localRevisionRef.current += 1;
    setSaveState(navigator.onLine ? "DIRTY" : "OFFLINE");
    setMessage("");
  }, []);

  const setDocument = useCallback(
    (next: TDocument | ((current: TDocument) => TDocument)) => {
      const value =
        typeof next === "function"
          ? (next as (current: TDocument) => TDocument)(documentRef.current)
          : next;
      documentRef.current = value;
      setDocumentState(value);
      markChanged();
    },
    [markChanged],
  );

  const setName = useCallback(
    (next: string) => {
      nameRef.current = next;
      setNameState(next);
      markChanged();
    },
    [markChanged],
  );

  const save = useCallback(
    async (previewObjectKey?: string) => {
      if (savingRef.current || saveState === "CONFLICT") return false;
      if (!navigator.onLine) {
        setSaveState("OFFLINE");
        return false;
      }
      savingRef.current = true;
      const capturedRevision = localRevisionRef.current;
      const capturedDocument = documentRef.current;
      const capturedName = nameRef.current;
      const capturedEditVersion = editVersionRef.current;
      setSaveState("SAVING");
      setMessage("");
      try {
        const result = await saveFaceboothProjectAction(boothId, projectId, {
          expectedEditVersion: capturedEditVersion,
          name: capturedName,
          document: capturedDocument,
          ...(previewObjectKey ? { previewObjectKey } : {}),
        });
        if (result.kind === "conflict") {
          setSaveState("CONFLICT");
          return false;
        }
        if (result.kind !== "saved") {
          setSaveState("ERROR");
          setMessage("save-failed");
          return false;
        }
        editVersionRef.current = result.project.editVersion;
        setEditVersion(result.project.editVersion);
        if (localRevisionRef.current === capturedRevision) {
          const parsed = parseDocument(result.project.document);
          if (parsed) {
            documentRef.current = parsed;
            setDocumentState(parsed);
          }
          setSaveState("SAVED");
          await deleteFaceboothDraft(boothId, projectId).catch(() => undefined);
        } else {
          setSaveState("DIRTY");
        }
        return true;
      } catch {
        setSaveState(navigator.onLine ? "ERROR" : "OFFLINE");
        setMessage("save-failed");
        return false;
      } finally {
        savingRef.current = false;
      }
    },
    [boothId, parseDocument, projectId, saveState],
  );

  useEffect(() => {
    let active = true;
    void readFaceboothDraft(boothId, projectId)
      .then((draft) => {
        if (
          active &&
          draft &&
          draft.projectId === projectId &&
          draft.boothId === boothId &&
          parseDocument(draft.document)
        ) {
          setRecoveryDraft(draft);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [boothId, parseDocument, projectId]);

  useEffect(() => {
    if (!["DIRTY", "OFFLINE", "ERROR", "CONFLICT"].includes(saveState)) {
      return;
    }
    void writeFaceboothDraft({
      boothId,
      projectId,
      baseEditVersion: editVersionRef.current,
      name,
      document,
      updatedAt: new Date().toISOString(),
    }).catch(() => undefined);
  }, [boothId, document, name, projectId, saveState]);

  useEffect(() => {
    if (saveState !== "DIRTY" || !name.trim()) return;
    const timeout = window.setTimeout(() => void save(), 1_000);
    return () => window.clearTimeout(timeout);
  }, [document, name, save, saveState]);

  useEffect(() => {
    const handleOffline = () => {
      if (saveState !== "SAVED") setSaveState("OFFLINE");
    };
    const handleOnline = () => {
      if (saveState === "OFFLINE") setSaveState("DIRTY");
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [saveState]);

  const restoreRecoveryDraft = useCallback(() => {
    if (!recoveryDraft) return;
    const parsed = parseDocument(recoveryDraft.document);
    if (!parsed) return;
    documentRef.current = parsed;
    nameRef.current = recoveryDraft.name;
    editVersionRef.current = recoveryDraft.baseEditVersion;
    setDocumentState(parsed);
    setNameState(recoveryDraft.name);
    setEditVersion(recoveryDraft.baseEditVersion);
    setRecoveryDraft(null);
    markChanged();
  }, [markChanged, parseDocument, recoveryDraft]);

  const discardRecoveryDraft = useCallback(async () => {
    await deleteFaceboothDraft(boothId, projectId).catch(() => undefined);
    setRecoveryDraft(null);
  }, [boothId, projectId]);

  const reloadRemote = useCallback(async () => {
    await deleteFaceboothDraft(boothId, projectId).catch(() => undefined);
    window.location.reload();
  }, [boothId, projectId]);

  const duplicateMyVersion = useCallback(async () => {
    const result = await createFaceboothProjectAction(boothId, {
      name: copyName(nameRef.current),
      kind,
      document: documentRef.current,
    });
    if (result.kind !== "created") {
      setSaveState("ERROR");
      setMessage("duplicate-failed");
      return;
    }
    await deleteFaceboothDraft(boothId, projectId).catch(() => undefined);
    window.location.assign(`/manage/${boothId}/facebooth/${result.project.id}`);
  }, [boothId, copyName, kind, projectId]);

  const savePreview = useCallback(
    (previewObjectKey: string) => save(previewObjectKey),
    [save],
  );

  return {
    document,
    name,
    editVersion,
    saveState,
    message,
    recoveryDraft,
    setDocument,
    setName,
    saveNow: save,
    savePreview,
    restoreRecoveryDraft,
    discardRecoveryDraft,
    reloadRemote,
    duplicateMyVersion,
  };
}
