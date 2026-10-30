import type { KnowledgeDocument } from '../types';

const DB_NAME = 'lingxi-knowledge-files';
const STORE_NAME = 'originals';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('当前浏览器无法保存原文件。')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    let settled = false;
    const timeout = setTimeout(() => { settled = true; reject(new Error('原文件存储暂时不可用，请重试。')); }, 8000);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); };
    request.onsuccess = () => { clearTimeout(timeout); if (settled) { request.result.close(); return; } request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => { clearTimeout(timeout); reject(request.error ?? new Error('无法读取原文件。')); };
    request.onblocked = () => { settled = true; clearTimeout(timeout); reject(new Error('请关闭其他页面后重试。')); };
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error('原文件存储操作失败。'));
    });
  } finally { database.close(); }
}

export async function saveOriginal(id: string, file: Blob): Promise<void> {
  if (!id || !(file instanceof Blob)) throw new Error('请提供文件 ID 和原文件。');
  await transact('readwrite', (store) => store.put(file, id));
}
export async function getOriginal(id: string): Promise<Blob | undefined> {
  const result: unknown = await transact('readonly', (store) => store.get(id));
  if (result === undefined) return undefined;
  if (!(result instanceof Blob)) throw new Error('原文件无法读取，请重新上传。');
  return result;
}
export async function deleteOriginal(id: string): Promise<void> { await transact('readwrite', (store) => store.delete(id)); }

export async function downloadOriginal(document: KnowledgeDocument) {
  const blob = await getOriginal(document.id);
  if (!blob) throw new Error('原文件不可用，请重新上传。');
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = blob instanceof File && blob.name ? blob.name : document.source || `${document.name}.${document.type.toLowerCase()}`;
  window.document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}
