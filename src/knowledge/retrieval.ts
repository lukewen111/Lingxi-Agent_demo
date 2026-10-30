import type { AppState } from '../types';
import type { WorkflowNodeData } from '../workflows/model';

type KnowledgeState = Pick<AppState, 'knowledgeFolders' | 'knowledgeQas' | 'documents'>;
export interface KnowledgeHit {
  id: string;
  kind: 'qa' | 'document';
  answer: string;
  source: string;
  folderId: string;
  documentId?: string;
}

const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const stopWords = new Set(['请问', '如何', '怎么', '什么', '是否', '可以', '我的', '这个', '一下', 'the', 'is', 'a', 'an', 'how', 'to']);

function score(query: string, text: string): number {
  const needle = normalize(query);
  const haystack = normalize(text);
  if (!needle || !haystack) return 0;
  const terms = new Set<string>();
  for (const word of needle.match(/[a-z0-9]+|[\p{Script=Han}]+/gu) ?? []) {
    if (/\p{Script=Han}/u.test(word)) {
      for (let index = 0; index < word.length - 1; index++) terms.add(word.slice(index, index + 2));
    } else terms.add(word);
  }
  const keywords = [...terms].filter((term) => !stopWords.has(term));
  if (!keywords.length) return 0;
  if (needle === haystack) return 1000;
  if (haystack.includes(needle)) return 500;
  return keywords.filter((term) => /\p{Script=Han}/u.test(term) ? haystack.includes(term) : haystack.split(' ').includes(term)).length;
}

/** Bindings are level-one folder IDs; callers explicitly select draft or published config. */
export function retrieveKnowledge(state: KnowledgeState, knowledgeIds: readonly string[], query: string): KnowledgeHit | undefined {
  const folders = new Set(state.knowledgeFolders.filter((folder) => folder.level === 1 && knowledgeIds.includes(folder.id)).map((folder) => folder.id));
  let previousSize = -1;
  while (folders.size !== previousSize) {
    previousSize = folders.size;
    state.knowledgeFolders.forEach((folder) => { if (folder.parentId && folders.has(folder.parentId)) folders.add(folder.id); });
  }
  const files = state.documents.filter((file) => folders.has(file.folderId ?? '') && file.status === 'success' && file.enabled !== false);
  const source = (folderId: string, name: string) => `${state.knowledgeFolders.find((folder) => folder.id === folderId)?.name ?? folderId} / ${name}`;
  const rank = (items: { hit: KnowledgeHit; score: number }[]) => items.filter((item) => item.score > 0).sort((a, b) => b.score - a.score || (a.hit.id < b.hit.id ? -1 : a.hit.id > b.hit.id ? 1 : 0))[0]?.hit;
  const qa = rank(state.knowledgeQas.filter((item) => item.enabled && folders.has(item.folderId) && item.answerText.trim()).map((item) => ({
    score: score(query, item.question),
    hit: { id: item.id, kind: 'qa', answer: item.answerText, folderId: item.folderId, documentId: item.sourceDocumentId, source: source(item.folderId, `问答：${item.question}${item.sourceDocumentId ? `（${state.documents.find((file) => file.id === item.sourceDocumentId)?.name ?? ''}）` : ''}`) },
  })));
  if (qa) return qa;
  return rank(files.filter((file) => file.content.trim()).map((file) => ({
    score: score(query, `${file.name} ${file.content}`),
    hit: { id: file.id, kind: 'document', answer: file.content, folderId: file.folderId!, documentId: file.id, source: source(file.folderId!, `文件：${file.name}`) },
  })));
}

/** Execution nodes must supply their own config, never inherit Agent bindings. */
export function retrieveNodeKnowledge(state: KnowledgeState, config: WorkflowNodeData['config'], query: string): KnowledgeHit | undefined {
  let ids: unknown;
  try { ids = JSON.parse(config.knowledgeIds || '[]'); } catch { return undefined; }
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return undefined;
  return retrieveKnowledge(state, ids, query);
}
