import type { FaceboothProjectDocument } from "@/lib/facebooth-documents";

const DATABASE_NAME = "cyfurden-facebooth";
const DATABASE_VERSION = 1;
const STORE_NAME = "project-drafts";

export type FaceboothRecoveryDraft = {
  key: string;
  boothId: string;
  projectId: string;
  baseEditVersion: number;
  name: string;
  document: FaceboothProjectDocument;
  updatedAt: string;
};

export const faceboothDraftKey = (boothId: string, projectId: string) =>
  `${boothId}:${projectId}`;

function openDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Draft storage failed."));
  });
}

async function runDraftRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDraftDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Draft storage failed."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Draft storage was aborted."));
    });
  } finally {
    database.close();
  }
}

export async function readFaceboothDraft(boothId: string, projectId: string) {
  return ((await runDraftRequest("readonly", (store) =>
    store.get(faceboothDraftKey(boothId, projectId)),
  )) ?? null) as FaceboothRecoveryDraft | null;
}

export async function writeFaceboothDraft(
  draft: Omit<FaceboothRecoveryDraft, "key">,
) {
  await runDraftRequest("readwrite", (store) =>
    store.put({
      ...draft,
      key: faceboothDraftKey(draft.boothId, draft.projectId),
    }),
  );
}

export async function deleteFaceboothDraft(boothId: string, projectId: string) {
  await runDraftRequest("readwrite", (store) =>
    store.delete(faceboothDraftKey(boothId, projectId)),
  );
}
