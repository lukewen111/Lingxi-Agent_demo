import { now } from '../mockData';
import type { KnowledgeCandidate, KnowledgeDocument, KnowledgeQa } from '../types';

type DemoScenario = NonNullable<KnowledgeDocument['demoScenario']>;

const PROCESSING_ERROR = '文档处理失败：文件内容暂时无法解析，请重新处理。';
const GENERATION_ERROR = '文档处理成功，但问答生成失败，请重新生成。';

function scenarioFromName(name: string): DemoScenario {
  const normalized = name.normalize('NFKC').toLowerCase();
  if (normalized.includes('生成失败') || normalized.includes('generation-failed')) return 'generation-failed';
  if (normalized.includes('失败') || normalized.includes('failed')) return 'processing-failed';
  if (normalized.includes('空') || normalized.includes('empty')) return 'empty';
  if (normalized.includes('冲突') || normalized.includes('退款')) return 'conflict';
  return 'success';
}

function candidate(
  documentId: string,
  index: number,
  question: string,
  answerText: string,
  patch: Partial<Pick<KnowledgeCandidate, 'resolution' | 'existingQaId'>> = {},
): KnowledgeCandidate {
  return {
    id: `${documentId}-candidate-${index}`,
    question,
    answerHtml: `<p>${answerText}</p>`,
    answerText,
    selected: true,
    resolution: 'new',
    status: 'pending',
    ...patch,
  };
}

function generatedCandidates(document: KnowledgeDocument, existingQas: readonly KnowledgeQa[]): KnowledgeCandidate[] {
  if (document.demoScenario === 'conflict') {
    const refundQa = existingQas.find((qa) => qa.id === 'qa-refund-time')
      ?? existingQas.find((qa) => qa.question.includes('退款'));
    return [candidate(
      document.id,
      1,
      '退款审核通过后多久到账？',
      '退款审核通过后，款项通常会在 1—5 个工作日内原路退回。',
      refundQa ? { resolution: 'keep', existingQaId: refundQa.id } : undefined,
    )];
  }

  const title = (document.name || document.source).replace(/\.[^.]+$/, '').trim() || '该文件';
  const themes = ['核心内容', '适用范围', '目标对象', '前置条件', '关键流程', '操作步骤', '时间要求', '注意事项', '异常处理', '责任归属', '输入资料', '输出结果', '风险控制', '常见问题', '变更规则', '权限限制', '数据要求', '质量标准', '复核机制', '反馈处理', '关联流程', '有效范围', '更新频率', '支持边界'];
  const baseCandidates = themes.map((theme, index) => candidate(
    document.id,
    index + 1,
    `《${title}》的${theme}是什么？`,
    `《${title}》已完成解析；关于${theme}的具体说明，请以该文件中的内容为准。`,
  ));

  const seen = new Set<string>();
  return baseCandidates.flatMap((item) => {
    const key = `${item.question.trim()}\n${item.answerText.trim()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const existing = existingQas.find((qa) => qa.question.trim() === item.question.trim());
    if (!existing) return [item];
    if (existing.answerText.trim() === item.answerText.trim()) return [];
    return [{ ...item, resolution: 'keep' as const, existingQaId: existing.id }];
  });
}

function previewText(document: KnowledgeDocument, scenario: DemoScenario): string {
  const sourceName = document.name || document.source;
  if (scenario === 'empty') return `已完成“${sourceName}”的解析，但未识别到可用于生成问答的正文内容。`;
  if (scenario === 'conflict') return `已解析“${sourceName}”：退款审核通过后，款项通常会在 1—5 个工作日内原路退回。`;
  return `已解析“${sourceName}”：订单进入发货流程前可申请修改收货地址；电子发票可在订单详情中提交申请。`;
}

export function inferDemoScenario(file: File): DemoScenario {
  return scenarioFromName(file.name);
}

export function simulateProcessedDocument(
  document: KnowledgeDocument,
  existingQas: readonly KnowledgeQa[],
): Partial<KnowledgeDocument> {
  const scenario = document.demoScenario ?? scenarioFromName(`${document.name} ${document.source}`);
  const processingAttempts = document.processingAttempts ?? 1;
  const generationAttempts = document.generationAttempts ?? 1;
  const updatedAt = now();

  if (scenario === 'processing-failed' && processingAttempts <= 1) {
    return {
      demoScenario: scenario,
      status: 'failed',
      content: PROCESSING_ERROR,
      processingError: PROCESSING_ERROR,
      processingAttempts,
      generatedQaStatus: 'pending',
      candidates: undefined,
      previewText: undefined,
      originalStored: document.originalStored,
      updatedAt,
    };
  }

  const preview = previewText(document, scenario);
  if (scenario === 'generation-failed' && generationAttempts <= 1) {
    return {
      demoScenario: scenario,
      status: 'success',
      content: GENERATION_ERROR,
      processingError: undefined,
      processingAttempts,
      generationAttempts,
      generatedQaStatus: 'failed',
      candidates: undefined,
      previewText: preview,
      originalStored: document.originalStored,
      updatedAt,
    };
  }

  const candidates = scenario === 'empty' ? [] : generatedCandidates({ ...document, demoScenario: scenario }, existingQas);
  return {
    demoScenario: scenario,
    status: 'success',
    content: preview,
    processingError: undefined,
    processingAttempts,
    generationAttempts,
    generatedQaStatus: scenario === 'empty' ? 'empty' : 'completed',
    candidates,
    previewText: preview,
    originalStored: document.originalStored,
    updatedAt,
  };
}

export function confirmCandidates(
  document: KnowledgeDocument,
  qas: readonly KnowledgeQa[],
): { qas: KnowledgeQa[]; document: KnowledgeDocument } {
  const timestamp = now();
  const nextQas = [...qas];

  for (const [index, item] of (document.candidates ?? []).entries()) {
    if (!item.selected || item.resolution === 'keep') continue;

    if (item.resolution === 'update' && item.existingQaId) {
      const qaIndex = nextQas.findIndex((qa) => qa.id === item.existingQaId);
      if (qaIndex >= 0) {
        nextQas[qaIndex] = {
          ...nextQas[qaIndex],
          question: item.question,
          answerHtml: item.answerHtml,
          answerText: item.answerText,
          updatedAt: timestamp,
        };
      }
      continue;
    }

    if (item.resolution === 'new') {
      const id = `${document.id}-qa-${index + 1}`;
      const created: KnowledgeQa = {
        id,
        question: item.question,
        answerHtml: item.answerHtml,
        answerText: item.answerText,
        folderId: document.folderId ?? '',
        enabled: true,
        source: 'file',
        sourceDocumentId: document.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const qaIndex = nextQas.findIndex((qa) => qa.id === id);
      if (qaIndex >= 0) nextQas[qaIndex] = { ...created, createdAt: nextQas[qaIndex].createdAt };
      else nextQas.push(created);
    }
  }

  return {
    qas: nextQas,
    document: {
      ...document,
      generatedQaStatus: 'confirmed',
      candidateBatches: [...(document.candidateBatches ?? []), {
        id: `${document.id}-batch-${document.generationAttempts ?? 1}`,
        status: 'confirmed',
        candidates: (document.candidates ?? []).map((item) => ({
          ...item,
          status: item.selected ? 'confirmed' : 'skipped',
        })),
        confirmedAt: timestamp,
      }],
      candidates: (document.candidates ?? []).map((item) => ({
        ...item,
        status: item.selected ? 'confirmed' : 'skipped',
      })),
      updatedAt: timestamp,
    },
  };
}

export function retryProcess(document: KnowledgeDocument): Partial<KnowledgeDocument> {
  return {
    status: 'adding',
    content: '正在重新处理文档…',
    processingError: undefined,
    processingAttempts: Math.max(2, (document.processingAttempts ?? 1) + 1),
    generatedQaStatus: 'pending',
    candidates: undefined,
    previewText: undefined,
    updatedAt: now(),
  };
}

export function retryGeneration(document: KnowledgeDocument): Partial<KnowledgeDocument> {
  return {
    generationAttempts: Math.max(2, (document.generationAttempts ?? 1) + 1),
    generatedQaStatus: 'pending',
    candidates: undefined,
    updatedAt: now(),
  };
}
