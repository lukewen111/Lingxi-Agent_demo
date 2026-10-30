import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, MouseEvent, ReactNode } from 'react';
import { Button, Checkbox, Drawer, Dropdown, Empty, Form, Input, Menu, Message, Modal, Popover, Select, Switch, Table } from '../components/ui';
import { IconCheck, IconClose, IconDelete, IconDown, IconExclamationCircle, IconFile, IconFolder, IconLayout, IconLoading, IconMore, IconPlus, IconRight, IconSearch, IconUpload } from '@arco-design/web-react/icon';
import { RichTextEditor } from '../components/RichTextEditor';
import { FilePreview } from '../knowledge/FilePreview';
import { deleteOriginal, saveOriginal } from '../knowledge/fileStorage';
import { confirmCandidates, inferDemoScenario, retryGeneration, retryProcess, simulateProcessedDocument } from '../knowledge/simulation';
import { useAppStore } from '../store';
import { now } from '../mockData';
import type { KnowledgeCandidate, KnowledgeCandidateBatch, KnowledgeDocument, KnowledgeFolder, KnowledgeQa } from '../types';

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const formatDate = (value: string) => value.replace('T', ' ').slice(0, 16);
const pathOf = (id: string, folders: KnowledgeFolder[]) => { const names: string[] = []; let current = folders.find((folder) => folder.id === id); while (current) { names.unshift(current.name); current = folders.find((folder) => folder.id === current?.parentId); } return names.join(' / '); };
const descendants = (id: string, folders: KnowledgeFolder[]) => { const ids = new Set([id]); let changed = true; while (changed) { changed = false; folders.forEach((folder) => { if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) { ids.add(folder.id); changed = true; } }); } return ids; };
const KnowledgeAllIcon = () => <svg className="knowledge-all-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
const tableViewport = () => {
  if (typeof window === 'undefined') return { pageSize: 12, bodyHeight: 816 };
  const bodyHeight = Math.max(480, window.innerHeight - 420);
  return { pageSize: Math.max(8, Math.min(12, Math.floor(bodyHeight / 68))), bodyHeight };
};
type MoveState = { type: 'qa' | 'file'; ids: string[]; rootId: string } | { type: 'folder'; folder: KnowledgeFolder; rootId: string };

export function KnowledgeCenterPage() {
  const { state, dispatch } = useAppStore();
  const [folderId, setFolderId] = useState('all');
  const [tab, setTab] = useState<'qa' | 'file'>('file');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(state.knowledgeFolders.filter((folder) => folder.level < 3).map((folder) => folder.id)));
  const [folderDialog, setFolderDialog] = useState<{ parent?: KnowledgeFolder; edit?: KnowledgeFolder }>();
  const [qaEditor, setQaEditor] = useState<KnowledgeQa | null | undefined>();
  const [upload, setUpload] = useState(false);
  const [preview, setPreview] = useState<KnowledgeDocument>();
  const [updatingFile, setUpdatingFile] = useState<KnowledgeDocument>();
  const [candidateDoc, setCandidateDoc] = useState<KnowledgeDocument>();
  const [moveState, setMoveState] = useState<MoveState>();
  const [moveTargetId, setMoveTargetId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [tableLayout, setTableLayout] = useState(tableViewport);
  const timers = useRef<number[]>([]);
  const processingIds = useRef(new Set<string>());

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  useEffect(() => { const update = () => setTableLayout(tableViewport()); window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); }, []);
  const current = state.knowledgeFolders.find((folder) => folder.id === folderId);
  const scope = folderId === 'all' ? undefined : current?.level === 1 ? descendants(folderId, state.knowledgeFolders) : new Set([folderId]);
  const rootIdOf = (id?: string) => { let folder = state.knowledgeFolders.find((item) => item.id === id); while (folder?.parentId) folder = state.knowledgeFolders.find((item) => item.id === folder!.parentId); return folder?.id; };
  const generationQas = useCallback((document: KnowledgeDocument) => {
    let topLevelId = document.folderId;
    let folder = state.knowledgeFolders.find((item) => item.id === topLevelId);
    while (folder?.parentId) { topLevelId = folder.parentId; folder = state.knowledgeFolders.find((item) => item.id === folder!.parentId); }
    const ids = topLevelId ? descendants(topLevelId, state.knowledgeFolders) : new Set<string>();
    return state.knowledgeQas.filter((qa) => ids.has(qa.folderId));
  }, [state.knowledgeFolders, state.knowledgeQas]);
  const qas = state.knowledgeQas.filter((qa) => (!scope || scope.has(qa.folderId)) && `${qa.question}${qa.answerText}`.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || String(qa.enabled) === status));
  const files = state.documents.filter((file) => (!scope || scope.has(file.folderId || '')) && file.name.toLowerCase().includes(query.toLowerCase()));
  const selectedFileDocuments = state.documents.filter((file) => selectedFiles.includes(file.id));
  const canBatchOperateFiles = selectedFileDocuments.length === selectedFiles.length && selectedFileDocuments.every((file) => file.status === 'success');
  const emptyFolderMessage = current?.level === 2 ? '当前分类暂无直接归属资源，下级分类中可能包含知识' : '';
  const selectFolderForCreate = () => (current?.level === 1 ? state.knowledgeFolders.find((folder) => folder.parentId === current.id && folder.isDefault)?.id : current?.level && current.level > 1 ? current.id : '') || '';

  const folderReferenced = (folder: KnowledgeFolder) => {
    if (folder.level !== 1) return false;
    const agentReference = state.agents.some((agent) => agent.draft.knowledgeIds.includes(folder.id) || Boolean(agent.published?.knowledgeIds.includes(folder.id)));
    const workflowReference = state.workflows.some((workflow) => [workflow.draft, workflow.published].filter(Boolean).some((draft) => draft!.nodes.some((node) => {
      try { return JSON.parse(node.data.config.knowledgeIds || '[]').includes(folder.id); } catch { return false; }
    })));
    return agentReference || workflowReference;
  };
  const siblingDuplicate = (name: string, parentId?: string, ignoreId?: string) => state.knowledgeFolders.some((folder) => folder.id !== ignoreId && folder.parentId === parentId && folder.name.trim().toLowerCase() === name.trim().toLowerCase());
  const saveFolder = (name: string) => {
    const edit = folderDialog?.edit; const parent = folderDialog?.parent;
    if (siblingDuplicate(name, edit?.parentId ?? parent?.id, edit?.id)) return Message.error('同一层级下已存在同名文件夹');
    if (edit) dispatch({ type: 'knowledge.folder.save', folder: { ...edit, name, updatedAt: now() } });
    else {
      const level = parent ? (parent.level + 1) as 2 | 3 : 1;
      const folder: KnowledgeFolder = { id: makeId('folder'), name, parentId: parent?.id, level, createdAt: now(), updatedAt: now() };
      dispatch({ type: 'knowledge.folder.save', folder });
      if (level === 1) dispatch({ type: 'knowledge.folder.save', folder: { id: makeId('folder'), name: '默认分类', parentId: folder.id, level: 2, isDefault: true, createdAt: now(), updatedAt: now() } });
    }
    setFolderDialog(undefined); Message.success(edit ? '文件夹已重命名' : '文件夹已创建');
  };
  const removeFolder = (folder: KnowledgeFolder) => {
    if (folderReferenced(folder)) return Modal.confirm({ title: '无法删除文件夹', content: '当前文件夹已被 AI 客服或工作流引用，请先解除绑定并发布更新。', hideCancel: true, okText: '知道了' });
    const ids = descendants(folder.id, state.knowledgeFolders); const childCount = ids.size - 1; const qaCount = state.knowledgeQas.filter((item) => ids.has(item.folderId)).length; const fileCount = state.documents.filter((item) => ids.has(item.folderId || '')).length;
    Modal.confirm({ title: '删除文件夹？', content: `将删除 ${childCount} 个下级文件夹、${qaCount} 条常见问题和 ${fileCount} 个文件，且不可恢复。`, okButtonProps: { status: 'danger' }, onOk: () => { dispatch({ type: 'knowledge.folder.delete', id: folder.id }); if (folderId === folder.id) setFolderId('all'); Message.success('文件夹已删除'); } });
  };
  const countKnowledge = (scopeIds?: Set<string>) => state.knowledgeQas.filter((qa) => !scopeIds || scopeIds.has(qa.folderId)).length + state.documents.filter((file) => !scopeIds || scopeIds.has(file.folderId || '')).length;
  const folderCountScope = (folder: KnowledgeFolder) => folder.level === 1 ? descendants(folder.id, state.knowledgeFolders) : new Set([folder.id]);
  const toggleFolder = (id: string) => setExpandedFolders((items) => { const next = new Set(items); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const rows = (parentId?: string, depth = 0): ReactNode[] => state.knowledgeFolders.filter((folder) => folder.parentId === parentId).flatMap((folder) => {
    const hasChildren = state.knowledgeFolders.some((item) => item.parentId === folder.id); const expanded = expandedFolders.has(folder.id);
    const row = <div className={`knowledge-tree-row${folderId === folder.id ? ' active' : ''}`} style={{ paddingLeft: 8 + depth * 18 }} key={folder.id}>
      <button type="button" className="knowledge-tree-select" onClick={() => setFolderId(folder.id)}><IconFolder /><span>{folder.name}</span><small>（{countKnowledge(folderCountScope(folder))}）</small></button>
      <div className="knowledge-tree-row-actions"><Dropdown trigger="click" droplist={<Menu>{folder.level < 3 && <Menu.Item key="add" onClick={() => setFolderDialog({ parent: folder })}>新建子文件夹</Menu.Item>}<Menu.Item key="edit" onClick={() => setFolderDialog({ edit: folder })}>重命名</Menu.Item>{folder.level > 1 && !folder.isDefault && <Menu.Item key="move" onClick={() => openFolderMove(folder)}>移动至</Menu.Item>}{!folder.isDefault && <Menu.Item key="delete" className="danger-menu-item" onClick={() => removeFolder(folder)}>删除</Menu.Item>}</Menu>}><Button type="text" className="knowledge-tree-more" icon={<IconMore />} aria-label={`${folder.name} 更多操作`} /></Dropdown>{hasChildren && <Button type="text" className="knowledge-tree-toggle" icon={expanded ? <IconDown /> : <IconRight />} aria-label={`${expanded ? '收起' : '展开'}${folder.name}`} onClick={() => toggleFolder(folder.id)} />}</div>
    </div>;
    return expanded ? [row, ...rows(folder.id, depth + 1)] : [row];
  });

  const finishProcessing = useCallback((item: KnowledgeDocument) => {
    if (processingIds.current.has(item.id)) return;
    processingIds.current.add(item.id);
    const latestQas = generationQas(item);
    const timer = window.setTimeout(() => {
      const parsingResult = { status: 'success' as const, content: '文件处理成功，正在生成候选问答…', processingError: undefined, generatedQaStatus: 'pending' as const, updatedAt: now() };
      const processed = { ...item, ...parsingResult };
      dispatch({ type: 'document.update', id: item.id, patch: parsingResult });
      processingIds.current.delete(item.id);
      const generationTimer = window.setTimeout(() => {
        const patch = simulateProcessedDocument(processed, latestQas);
        dispatch({ type: 'document.update', id: item.id, patch });
        setCandidateDoc((currentCandidate) => currentCandidate?.id === item.id ? { ...processed, ...patch } : currentCandidate);
      }, 700);
      timers.current.push(generationTimer);
    }, 1100);
    timers.current.push(timer);
  }, [dispatch, generationQas]);
  useEffect(() => { state.documents.filter((item) => item.status === 'adding').forEach(finishProcessing); }, [finishProcessing, state.documents]);
  const saveFiles = async (fileList: File[], target: string) => {
    for (const file of fileList) {
      const item: KnowledgeDocument = { id: makeId('doc'), type: file.name.split('.').pop()?.toUpperCase() || 'FILE', name: file.name, source: file.name, size: file.size, creator: 'Owen', status: 'adding', content: '正在解析文件…', folderId: target, enabled: true, generatedQaStatus: 'pending', demoScenario: inferDemoScenario(file), processingAttempts: 1, generationAttempts: 0, createdAt: now(), updatedAt: now() };
      try { await saveOriginal(item.id, file); item.originalStored = true; } catch { Message.warning(`${file.name} 的原文件保存失败，仍可继续演示处理流程`); }
      dispatch({ type: 'document.add', document: item });
      finishProcessing(item);
    }
    setUpload(false); Message.success(fileList.length === 1 ? '文件已上传，正在解析并生成候选问答' : `已上传 ${fileList.length} 个文件，首个文件正在生成候选问答`);
  };
  const retryFile = (item: KnowledgeDocument) => { const patch = retryProcess(item); const next = { ...item, ...patch }; dispatch({ type: 'document.update', id: item.id, patch }); finishProcessing(next); Message.success('已重新开始处理'); };
  const regenerate = (item: KnowledgeDocument) => { const patch = retryGeneration(item); const pending = { ...item, ...patch }; dispatch({ type: 'document.update', id: item.id, patch }); setCandidateDoc(pending); const timer = window.setTimeout(() => { const result = simulateProcessedDocument(pending, generationQas(pending)); dispatch({ type: 'document.update', id: item.id, patch: result }); setCandidateDoc({ ...pending, ...result }); }, 900); timers.current.push(timer); Message.success('已开始生成新的问答批次'); };
  const openCandidates = (item: KnowledgeDocument) => { if (item.generatedQaStatus) { setCandidateDoc(item); return; } const patch = simulateProcessedDocument({ ...item, generationAttempts: 2 }, generationQas(item)); dispatch({ type: 'document.update', id: item.id, patch }); setCandidateDoc({ ...item, ...patch }); };
  const openConfirmationRecord = (item: KnowledgeDocument, batch?: KnowledgeCandidateBatch) => { const records = item.candidateBatches || []; const record = batch ?? records[records.length - 1]; if (record) setCandidateDoc({ ...item, generatedQaStatus: 'confirmed', candidates: record.candidates }); };
  const saveQa = (qa: KnowledgeQa) => { dispatch({ type: 'knowledge.qa.save', qa }); setQaEditor(undefined); Message.success('问答已保存'); };
  const openResourceMove = (type: 'qa' | 'file', ids: string[]) => {
    if (type === 'qa') {
      const items = state.knowledgeQas.filter((item) => ids.includes(item.id));
      if (!items.length || new Set(items.map((item) => rootIdOf(item.folderId))).size !== 1) return Message.warning('仅支持同一一级文件夹内移动');
      setMoveTargetId(''); setMoveState({ type, ids, rootId: rootIdOf(items[0].folderId)! });
      return;
    }
    const items = state.documents.filter((item) => ids.includes(item.id));
    if (!items.length || new Set(items.map((item) => rootIdOf(item.folderId))).size !== 1) return Message.warning('仅支持同一一级文件夹内移动');
    if (items.some((item) => item.status !== 'success')) return Message.warning('处理完成后才可移动文件');
    setMoveTargetId(''); setMoveState({ type, ids, rootId: rootIdOf(items[0].folderId)! });
  };
  const openFolderMove = (folder: KnowledgeFolder) => { if (folder.isDefault || folder.level === 1) return; setMoveTargetId(''); setMoveState({ type: 'folder', folder, rootId: rootIdOf(folder.id)! }); };
  const confirmMove = () => {
    if (!moveState || !moveTargetId) return Message.warning('请选择目标分类');
    if (moveState.type === 'folder') dispatch({ type: 'knowledge.folder.move', id: moveState.folder.id, parentId: moveTargetId });
    else dispatch({ type: 'knowledge.resources.move', resource: moveState.type, ids: moveState.ids, folderId: moveTargetId });
    if (moveState.type === 'qa') setSelected([]);
    if (moveState.type === 'file') setSelectedFiles([]);
    setMoveState(undefined); setMoveTargetId(''); Message.success('已移动至目标分类');
  };
  const updateFile = async (item: KnowledgeDocument, file: File) => {
    const patch: Partial<KnowledgeDocument> = { type: file.name.split('.').pop()?.toUpperCase() || 'FILE', name: file.name, source: file.name, size: file.size, status: 'adding', content: '正在更新并解析文件…', enabled: item.enabled, generatedQaStatus: 'pending', candidates: undefined, demoScenario: inferDemoScenario(file), processDueAt: undefined, generationDueAt: undefined, processingError: undefined, processingAttempts: (item.processingAttempts || 0) + 1, generationAttempts: item.generationAttempts || 0, updatedAt: now() };
    try { await saveOriginal(item.id, file); patch.originalStored = true; } catch { Message.warning('原文件保存失败，仍可继续演示处理流程'); }
    const next = { ...item, ...patch };
    dispatch({ type: 'document.update', id: item.id, patch }); setUpdatingFile(undefined); setPreview(undefined); finishProcessing(next); Message.success('文件已更新，正在重新解析并生成候选问答');
  };
  const deleteFile = (item: KnowledgeDocument) => Modal.confirm({ title: '删除文件？', content: '将删除文件及未确认候选问答。已确认入库的常见问题将保留，请按需复核或删除。', okButtonProps: { status: 'danger' }, onOk: async () => { await deleteOriginal(item.id).catch(() => undefined); dispatch({ type: 'document.delete', id: item.id }); Message.success('文件已删除'); } });
  const deleteSelectedFiles = () => Modal.confirm({ title: `删除 ${selectedFiles.length} 个文件？`, content: '将删除文件及未确认候选问答。已确认入库的常见问题将保留，请按需复核或删除。', okButtonProps: { status: 'danger' }, onOk: async () => { await Promise.all(selectedFiles.map((id) => deleteOriginal(id).catch(() => undefined))); selectedFiles.forEach((id) => dispatch({ type: 'document.delete', id })); setSelectedFiles([]); Message.success('文件已删除'); } });
  const stopRow = (event: MouseEvent) => event.stopPropagation();
  const primaryAction = tab === 'file' ? <Button type="primary" icon={<IconUpload />} onClick={() => setUpload(true)}>上传文件</Button> : <Button type="primary" icon={<IconPlus />} onClick={() => setQaEditor(null)}>添加问答</Button>;

  return <div className="page-content module-page knowledge-workspace">
    <div className={`knowledge-layout${treeCollapsed ? ' is-tree-collapsed' : ''}`}>
      <aside className="knowledge-tree">{!treeCollapsed && <><div className={`knowledge-tree-head${folderId === 'all' ? ' active' : ''}`}><button type="button" className={`knowledge-tree-title${folderId === 'all' ? ' active' : ''}`} onClick={() => setFolderId('all')}><KnowledgeAllIcon /><span>全部知识</span><small>（{countKnowledge()}）</small></button><Button type="text" icon={<IconPlus />} aria-label="新建一级文件夹" onClick={() => setFolderDialog({})} /></div><div className="knowledge-tree-list">{rows()}</div></>}</aside>
      <section className="knowledge-main">
        <div className="knowledge-main-title"><Button type="text" className={`knowledge-tree-panel-toggle${treeCollapsed ? ' is-collapsed' : ''}`} icon={<IconLayout />} aria-label={treeCollapsed ? '展开全部知识目录' : '收起全部知识目录'} onClick={() => setTreeCollapsed((value) => !value)} /><h2>{current?.name || '全部知识'}</h2></div>
        <div className="knowledge-tabs-bar"><div className="knowledge-tabs"><button className={tab === 'file' ? 'active' : ''} onClick={() => setTab('file')}>文件</button><button className={tab === 'qa' ? 'active' : ''} onClick={() => setTab('qa')}>常见问题</button></div>{primaryAction}</div>
        <div className="module-toolbar"><Input.Search value={query} onChange={setQuery} allowClear placeholder={tab === 'qa' ? '搜索问题' : '搜索文件名称'} />{tab === 'qa' && <Select value={status} onChange={setStatus} options={[{ value: 'all', label: '全部状态' }, { value: 'true', label: '已启用' }, { value: 'false', label: '已停用' }]} style={{ width: 120 }} />}</div>
        {tab === 'qa' ? <>
          <Table className="knowledge-qa-table" rowKey="id" dataSource={qas} noDataElement={<Empty description={emptyFolderMessage || '暂无常见问题'}><Button type="primary" onClick={() => setQaEditor(null)}>添加问答</Button></Empty>} pagination={{ pageSize: tableLayout.pageSize }} scroll={{ y: tableLayout.bodyHeight }} onRow={(item: KnowledgeQa) => ({ onClick: () => setQaEditor(item), className: 'knowledge-clickable-row' })} rowSelection={{ selectedRowKeys: selected, onChange: (keys: unknown[]) => setSelected(keys as string[]) }} columns={[
            { title: '问题', dataIndex: 'question', render: (value: string) => <span className="knowledge-single-line" title={value}>{value}</span> },
            { title: '启用状态', dataIndex: 'enabled', width: 120, render: (value: boolean, item: KnowledgeQa) => <span onClick={stopRow}><Switch checked={value} onChange={(enabled) => { dispatch({ type: 'knowledge.qa.toggle', id: item.id, enabled }); Message.success(enabled ? '问答已启用' : '问答已停用'); }} aria-label={`${item.question}${value ? '已启用' : '已停用'}`} /></span> },
            { title: '更新时间', dataIndex: 'updatedAt', width: 180, render: formatDate },
            { title: '操作', width: 72, render: (_: unknown, item: KnowledgeQa) => <span onClick={stopRow}><Dropdown trigger="click" droplist={<Menu><Menu.Item key="edit" onClick={() => setQaEditor(item)}>编辑</Menu.Item><Menu.Item key="move" onClick={() => openResourceMove('qa', [item.id])}>移动至</Menu.Item><Menu.Item key="delete" className="danger-menu-item" onClick={() => Modal.confirm({ title: '删除问答？', content: '删除后不可恢复。', okButtonProps: { status: 'danger' }, onOk: () => dispatch({ type: 'knowledge.qa.delete', ids: [item.id] }) })}>删除</Menu.Item></Menu>}><Button type="text" className="table-more-button" icon={<IconMore />} aria-label={`${item.question} 更多操作`} /></Dropdown></span> },
          ]} />
          {selected.length > 0 && <div className="knowledge-batch-bar" role="toolbar" aria-label="常见问题批量操作"><span>已选择 {selected.length} 条</span><button type="button" className="knowledge-batch-select-all" onClick={() => setSelected(selected.length === qas.length ? [] : qas.map((item) => item.id))}>{selected.length === qas.length ? '取消全选' : `全选 ${qas.length} 条`}</button><i /><Button size="small" onClick={() => openResourceMove('qa', selected)}>移动至</Button><Button size="small" onClick={() => selected.forEach((id) => dispatch({ type: 'knowledge.qa.toggle', id, enabled: true }))}>启用</Button><Button size="small" onClick={() => selected.forEach((id) => dispatch({ type: 'knowledge.qa.toggle', id, enabled: false }))}>停用</Button><Button size="small" status="danger" onClick={() => Modal.confirm({ title: '删除问答？', content: '删除后不可恢复。', onOk: () => { dispatch({ type: 'knowledge.qa.delete', ids: selected }); setSelected([]); } })}>删除</Button><i /><Button type="text" size="small" icon={<IconClose />} aria-label="取消批量选择" onClick={() => setSelected([])} /></div>}
        </> : <><Table className="knowledge-file-table" tableLayoutFixed rowKey="id" dataSource={files} noDataElement={<Empty description={emptyFolderMessage || '暂无文件'}><Button type="primary" onClick={() => setUpload(true)}>上传文件</Button></Empty>} pagination={{ pageSize: tableLayout.pageSize }} scroll={{ y: tableLayout.bodyHeight }} rowSelection={{ selectedRowKeys: selectedFiles, onChange: (keys: unknown[]) => setSelectedFiles(keys as string[]) }} columns={[
          { title: '文件名称', dataIndex: 'name', width: 360, render: (value: string, item: KnowledgeDocument) => <button type="button" className="module-name-cell knowledge-file-preview-trigger knowledge-single-line" title={value} disabled={item.status !== 'success'} onClick={() => setPreview(item)}><span className="module-file-icon"><IconFile /></span><strong>{value}</strong>{item.enabled === false && <small className="muted">已停用</small>}</button> },
          { title: '文件大小', dataIndex: 'size', width: 120, render: (value?: number) => value ? `${(value / 1024 / 1024).toFixed(1)} MB` : '—' },
          { title: '处理状态', dataIndex: 'status', width: 220, render: (value: KnowledgeDocument['status'], item: KnowledgeDocument) => <span className={`knowledge-document-status ${value === 'success' ? 'success' : value === 'failed' ? 'failed' : 'processing'}`}>{value === 'success' ? <><IconCheck />处理成功{item.generatedQaStatus === 'pending' && <span className="knowledge-generation-progress"><IconLoading />正在生成问答</span>}{item.generatedQaStatus === 'completed' && (item.candidates?.length ? <button type="button" className="knowledge-generation-result knowledge-generation-result-button" onClick={(event) => { event.stopPropagation(); openCandidates(item); }}>待确认 {item.candidates.length} 条问答</button> : <span className="knowledge-generation-result">待确认 0 条问答</span>)}{item.generatedQaStatus === 'confirmed' && <span className="knowledge-generation-result">已确认 {item.candidates?.filter((candidate) => candidate.status === 'confirmed').length || 0} 条问答</span>}{item.generatedQaStatus === 'empty' && <span className="knowledge-generation-result">未生成可用问答</span>}{item.generatedQaStatus === 'failed' && <span className="knowledge-generation-error">问答生成失败</span>}</> : value === 'failed' ? <><IconExclamationCircle />处理失败</> : <><IconLoading />处理中</>}</span> },
          { title: '更新时间', dataIndex: 'updatedAt', width: 180, render: formatDate },
          { title: '操作', width: 72, render: (_: unknown, item: KnowledgeDocument) => <span onClick={stopRow}><Dropdown trigger="click" droplist={<Menu>{item.status === 'success' && <Menu.Item key="preview" onClick={() => setPreview(item)}>预览</Menu.Item>}{item.status === 'success' && <Menu.Item key="move" onClick={() => openResourceMove('file', [item.id])}>移动至</Menu.Item>}{item.status === 'success' && item.generatedQaStatus === 'completed' && <Menu.Item key="candidates" onClick={() => openCandidates(item)}>查看待确认问答</Menu.Item>}{item.status === 'success' && item.generatedQaStatus === 'confirmed' && <Menu.Item key="candidates" onClick={() => openConfirmationRecord(item)}>查看确认记录</Menu.Item>}{item.status === 'success' && (item.generatedQaStatus === 'failed' || item.generatedQaStatus === 'empty') && <Menu.Item key="candidates" onClick={() => openCandidates(item)}>查看生成结果</Menu.Item>}{item.status === 'success' && item.generatedQaStatus !== 'confirmed' && item.candidateBatches?.length ? <Menu.Item key="records" onClick={() => openConfirmationRecord(item)}>查看确认记录</Menu.Item> : null}<Menu.Item key="toggle" disabled={item.status !== 'success'} onClick={() => dispatch({ type: 'document.update', id: item.id, patch: { enabled: !item.enabled } })}>{item.enabled === false ? '启用' : '停用'}</Menu.Item>{item.status === 'failed' && <Menu.Item key="retry" onClick={() => retryFile(item)}>重新处理</Menu.Item>}<Menu.Item key="regenerate" onClick={() => regenerate(item)} disabled={item.status !== 'success' || item.generatedQaStatus === 'pending'}>{item.generatedQaStatus === 'failed' || item.generatedQaStatus === 'empty' ? '重新生成问答' : '生成新批次问答'}</Menu.Item><Menu.Item key="delete" className="danger-menu-item" onClick={() => deleteFile(item)}>删除</Menu.Item></Menu>}><Button type="text" className="table-more-button" icon={<IconMore />} aria-label={`${item.name} 更多操作`} /></Dropdown></span> },
        ]} />{selectedFiles.length > 0 && <div className="knowledge-batch-bar" role="toolbar" aria-label="文件批量操作"><span>已选择 {selectedFiles.length} 个文件</span><button type="button" className="knowledge-batch-select-all" onClick={() => setSelectedFiles(selectedFiles.length === files.length ? [] : files.map((item) => item.id))}>{selectedFiles.length === files.length ? '取消全选' : `全选 ${files.length} 个`}</button><i /><Button size="small" disabled={!canBatchOperateFiles} onClick={() => openResourceMove('file', selectedFiles)}>移动至</Button><Button size="small" disabled={!canBatchOperateFiles} onClick={() => selectedFiles.forEach((id) => dispatch({ type: 'document.update', id, patch: { enabled: true } }))}>启用</Button><Button size="small" disabled={!canBatchOperateFiles} onClick={() => selectedFiles.forEach((id) => dispatch({ type: 'document.update', id, patch: { enabled: false } }))}>停用</Button><Button size="small" status="danger" onClick={deleteSelectedFiles}>删除</Button><i /><Button type="text" size="small" icon={<IconClose />} aria-label="取消批量选择" onClick={() => setSelectedFiles([])} /></div>}</>}
      </section>
    </div>
    <MoveDialog state={moveState} folders={state.knowledgeFolders} targetId={moveTargetId} onChange={setMoveTargetId} onClose={() => { setMoveState(undefined); setMoveTargetId(''); }} onConfirm={confirmMove} />
    <FolderDialog state={folderDialog} onClose={() => setFolderDialog(undefined)} onSave={saveFolder} />
    <QaEditor open={qaEditor !== undefined} qa={qaEditor || undefined} folders={state.knowledgeFolders} initialFolder={selectFolderForCreate()} onClose={() => setQaEditor(undefined)} onSave={saveQa} />
    <UploadDialog open={upload} folders={state.knowledgeFolders} initialFolder={selectFolderForCreate()} onClose={() => setUpload(false)} onSave={saveFiles} />
    <UpdateFileDialog document={updatingFile} onClose={() => setUpdatingFile(undefined)} onSave={updateFile} />
    {preview && <FilePreview document={preview} onClose={() => setPreview(undefined)} onUpdate={(document) => { setPreview(undefined); setUpdatingFile(document); }} />}
    <CandidateDrawer document={candidateDoc} qas={state.knowledgeQas} onChange={(patch) => { if (!candidateDoc) return; dispatch({ type: 'document.update', id: candidateDoc.id, patch }); setCandidateDoc({ ...candidateDoc, ...patch }); }} onRegenerate={() => candidateDoc && regenerate(candidateDoc)} onClose={() => setCandidateDoc(undefined)} onConfirm={(document) => { const result = confirmCandidates(document, state.knowledgeQas); result.qas.forEach((qa) => dispatch({ type: 'knowledge.qa.save', qa })); dispatch({ type: 'document.update', id: document.id, patch: result.document }); setCandidateDoc(undefined); Message.success('问答已确认入库'); }} />
  </div>;
}

function MoveDialog({ state, folders, targetId, onChange, onClose, onConfirm }: { state?: MoveState; folders: KnowledgeFolder[]; targetId: string; onChange: (id: string) => void; onClose: () => void; onConfirm: () => void }) {
  const rootOf = (id?: string) => { let folder = folders.find((item) => item.id === id); while (folder?.parentId) folder = folders.find((item) => item.id === folder!.parentId); return folder?.id; };
  const folderSubtree = state?.type === 'folder' ? descendants(state.folder.id, folders) : new Set<string>();
  const maxLevel = state?.type === 'folder' ? Math.max(...[...folderSubtree].map((id) => folders.find((item) => item.id === id)?.level || 0)) : 0;
  const candidates = !state ? [] : state.type === 'folder'
    ? folders.filter((folder) => rootOf(folder.id) === state.rootId && folder.level < 3 && !folderSubtree.has(folder.id) && folder.id !== state.folder.parentId && maxLevel + (folder.level + 1 - state.folder.level) <= 3 && !folders.some((item) => item.parentId === folder.id && item.name.trim().toLowerCase() === state.folder.name.trim().toLowerCase()))
    : folders.filter((folder) => rootOf(folder.id) === state.rootId && folder.level > 1);
  const title = state?.type === 'folder' ? `移动文件夹「${state.folder.name}」` : state?.type === 'qa' ? `移动 ${state.ids.length} 条问答` : `移动 ${state?.ids.length || 0} 个文件`;
  return <Modal open={Boolean(state)} title={title} onCancel={onClose} onOk={onConfirm} okText="确认移动" okButtonProps={{ disabled: !targetId || !candidates.length }} className="knowledge-move-modal">
    {state && <><p className="knowledge-move-current">当前归属：{state.type === 'folder' ? pathOf(state.folder.id, folders) : `同属 ${pathOf(state.rootId, folders)}`}</p><Form layout="vertical"><Form.Item label="目标分类" required><Select value={targetId || undefined} placeholder="请选择目标分类" options={candidates.map((folder) => ({ value: folder.id, label: pathOf(folder.id, folders) }))} onChange={onChange} /></Form.Item></Form>{!candidates.length && <Empty description="当前没有可移动的目标分类" />}</>}
  </Modal>;
}

function UpdateFileDialog({ document, onClose, onSave }: { document?: KnowledgeDocument; onClose: () => void; onSave: (document: KnowledgeDocument, file: File) => void }) {
  const [file, setFile] = useState<File>();
  useEffect(() => { if (document) setFile(undefined); }, [document]);
  const choose = (files: FileList | null) => { const next = files?.[0]; if (!next) return; const ext = next.name.split('.').pop()?.toLowerCase(); if (!['pdf', 'txt', 'md'].includes(ext || '') || next.size > 50 * 1024 * 1024) return Message.error('仅支持 PDF、TXT、MD 文件，且单文件不超过 50 MB'); setFile(next); };
  return <Modal open={Boolean(document)} title="更新文件" onCancel={onClose} onOk={() => document && file ? onSave(document, file) : Message.warning('请选择文件')} okText="开始更新" okButtonProps={{ disabled: !file }}>
    {document && <><p className="knowledge-update-current">当前文件：{document.name}</p><input id="knowledge-update-file" type="file" hidden accept=".pdf,.txt,.md" onChange={(event) => choose(event.target.files)} /><button type="button" className="knowledge-file-dropzone" onClick={() => window.document.getElementById('knowledge-update-file')?.click()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files); }} onDragOver={(event) => event.preventDefault()}><span className="knowledge-file-upload-icon"><IconUpload /></span><strong>{file?.name || '点击或拖拽上传新文件'}</strong><span>支持 PDF、TXT、MD｜单文件 50 MB</span></button><p className="knowledge-update-hint">更新成功后将重新解析文件并生成候选问答。已确认入库的常见问题不会自动修改。</p></>}
  </Modal>;
}

function FolderDialog({ state, onClose, onSave }: { state?: { parent?: KnowledgeFolder; edit?: KnowledgeFolder }; onClose: () => void; onSave: (name: string) => void }) { const [name, setName] = useState(''); return <Modal open={Boolean(state)} title={state?.edit ? '重命名文件夹' : '新建文件夹'} onCancel={onClose} onOk={() => name.trim() ? onSave(name.trim()) : Message.error('请输入文件夹名称')} okText="保存" afterOpenChange={(visible) => visible && setName(state?.edit?.name || '')}><Form layout="vertical"><Form.Item label="文件夹名称" required><Input value={name} maxLength={50} onChange={setName} placeholder="请输入文件夹名称" /></Form.Item></Form></Modal>; }

function CategoryPicker({ value, folders, disabled, onChange }: { value: string; folders: KnowledgeFolder[]; disabled?: boolean; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const matches = (folder: KnowledgeFolder) => !normalized || folder.name.toLowerCase().includes(normalized);
  const roots = folders.filter((root) => root.level === 1 && (!normalized || matches(root) || folders.some((item) => descendants(root.id, folders).has(item.id) && matches(item))));
  const content = <div className="knowledge-category-popover"><Input prefix={<IconSearch />} value={query} onChange={setQuery} placeholder="搜索" allowClear /><div className="knowledge-category-tree">{roots.map((root) => {
    const seconds = folders.filter((folder) => folder.parentId === root.id && (!normalized || matches(folder) || folders.some((third) => third.parentId === folder.id && matches(third))));
    return <div key={root.id}><div className="knowledge-category-root"><IconDown /><IconFolder />{root.name}</div>{seconds.map((second) => <div key={second.id}><button type="button" className={value === second.id ? 'active' : ''} onClick={() => onChange(second.id)}><IconFolder /><span>{second.name}</span>{value === second.id && <IconCheck />}</button>{folders.filter((third) => third.parentId === second.id && matches(third)).map((third) => <button type="button" className={`is-third${value === third.id ? ' active' : ''}`} key={third.id} onClick={() => onChange(third.id)}><IconFolder /><span>{third.name}</span>{value === third.id && <IconCheck />}</button>)}</div>)}</div>;
  })}</div></div>;
  if (disabled) return <div className="knowledge-category-readonly" role="textbox" aria-label="所属分类" aria-readonly="true"><span>{value ? pathOf(value, folders) : '—'}</span></div>;
  return <Popover trigger="click" position="bl" content={content}><button type="button" className="knowledge-category-trigger"><span>{value ? pathOf(value, folders) : '请选择所属分类'}</span><IconDown /></button></Popover>;
}

function QaEditor({ open, qa, folders, initialFolder, onClose, onSave }: { open: boolean; qa?: KnowledgeQa; folders: KnowledgeFolder[]; initialFolder: string; onClose: () => void; onSave: (qa: KnowledgeQa) => void }) {
  const [question, setQuestion] = useState(''); const [html, setHtml] = useState(''); const [text, setText] = useState(''); const [folderId, setFolderId] = useState(''); const [initial, setInitial] = useState('');
  useEffect(() => { if (!open) return; const values = { question: qa?.question || '', html: qa?.answerHtml || '', folderId: qa?.folderId || initialFolder }; setQuestion(values.question); setHtml(values.html); setText(qa?.answerText || ''); setFolderId(values.folderId); setInitial(JSON.stringify(values)); }, [open, qa, initialFolder]);
  const dirty = initial !== JSON.stringify({ question, html, folderId });
  const close = () => dirty ? Modal.confirm({ title: '放弃未保存的修改？', content: '关闭后，本次修改将不会保存。', onOk: onClose }) : onClose();
  const save = () => { if (!question.trim() || !text.trim() || !folderId) return Message.error('请补全问题、答案和所属分类'); onSave({ id: qa?.id || makeId('qa'), question: question.trim(), answerHtml: html, answerText: text, folderId: qa?.folderId || folderId, enabled: qa?.enabled ?? true, source: qa?.source || 'manual', sourceDocumentId: qa?.sourceDocumentId, createdAt: qa?.createdAt || now(), updatedAt: now() }); };
  return <Drawer open={open} width={960} className="knowledge-qa-drawer" title={qa ? '编辑问答' : '添加问答'} onCancel={close} footer={<div className="knowledge-editor-footer"><Button onClick={close}>取消</Button><Button type="primary" onClick={save}>保存并关闭</Button></div>}><Form layout="vertical" className="knowledge-qa-editor"><Form.Item label="所属分类" required><CategoryPicker value={folderId} folders={folders} disabled={Boolean(qa)} onChange={setFolderId} /></Form.Item><Form.Item label="标准问题" required><Input value={question} maxLength={200} onChange={setQuestion} placeholder="请输入标准问题" /></Form.Item><Form.Item label="答案" required><RichTextEditor value={html} onChange={(nextHtml, nextText) => { setHtml(nextHtml); setText(nextText); }} /></Form.Item></Form></Drawer>;
}

function UploadDialog({ open, folders, initialFolder, onClose, onSave }: { open: boolean; folders: KnowledgeFolder[]; initialFolder: string; onClose: () => void; onSave: (files: File[], folderId: string) => void }) {
  const [files, setFiles] = useState<File[]>([]); const [folderId, setFolderId] = useState(initialFolder); const [dragging, setDragging] = useState(false);
  useEffect(() => { if (open) { setFolderId(initialFolder); setFiles([]); } }, [open, initialFolder]);
  const add = (list: FileList | null) => { const next = Array.from(list || []); const invalid = next.find((file) => !['pdf', 'txt', 'md'].includes(file.name.split('.').pop()?.toLowerCase() || '') || file.size > 50 * 1024 * 1024); if (invalid) return Message.error(`${invalid.name} 格式不支持或超过 50 MB`); if (next.length + files.length > 10) return Message.error('单次最多上传 10 个文件'); setFiles((items) => [...items, ...next.filter((file) => !items.some((item) => item.name === file.name && item.size === file.size))]); };
  const drop = (event: DragEvent) => { event.preventDefault(); setDragging(false); add(event.dataTransfer.files); };
  return <Modal open={open} title="上传文件" onCancel={onClose} onOk={() => files.length && folderId ? onSave(files, folderId) : Message.warning(!folderId ? '请选择所属分类' : '请选择文件')} okText="开始上传"><Form layout="vertical"><Form.Item label="所属分类" required><CategoryPicker value={folderId} folders={folders} onChange={setFolderId} /></Form.Item></Form><input id="knowledge-upload-input-v2" type="file" hidden multiple accept=".pdf,.txt,.md" onChange={(event) => add(event.target.files)} /><button type="button" className={`knowledge-file-dropzone${dragging ? ' is-dragging' : ''}`} onClick={() => document.getElementById('knowledge-upload-input-v2')?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}><span className="knowledge-file-upload-icon"><IconUpload /></span><strong>点击或拖拽文件到这里</strong><span>支持 PDF、TXT、MD｜单文件 50 MB｜最多 10 个</span></button>{files.map((file) => <div className="knowledge-upload-file" key={`${file.name}-${file.size}`}><span>{file.name}</span><Button type="text" icon={<IconDelete />} aria-label={`移除 ${file.name}`} onClick={() => setFiles((items) => items.filter((item) => item !== file))} /></div>)}</Modal>;
}

function CandidateDrawer({ document, qas, onChange, onRegenerate, onClose, onConfirm }: { document?: KnowledgeDocument; qas: KnowledgeQa[]; onChange: (patch: Partial<KnowledgeDocument>) => void; onRegenerate: () => void; onClose: () => void; onConfirm: (document: KnowledgeDocument) => void }) {
  const candidates = document?.candidates || [];
  const selectedCount = candidates.filter((candidate) => candidate.selected).length;
  const updateCandidate = (id: string, patch: Partial<KnowledgeCandidate>) => onChange({ candidates: candidates.map((candidate) => candidate.id === id ? { ...candidate, ...patch } : candidate) });
  if (!document) return null;
  const confirmed = document.generatedQaStatus === 'confirmed';
  const footer = document.generatedQaStatus === 'completed' && candidates.length ? <div className="knowledge-editor-footer"><span>已选择 {selectedCount} 条</span><Button onClick={onClose}>取消</Button><Button type="primary" disabled={!selectedCount} onClick={() => onConfirm(document)}>确认入库</Button></div> : null;
  return <Drawer open width={720} className="knowledge-candidate-drawer" title={confirmed ? '确认记录' : '生成问答'} onCancel={onClose} footer={footer}>
    <div className="knowledge-candidate-head"><div><strong>{document.name}</strong><p>{confirmed ? '本批次问答已确认入库，仅可查看记录。' : '确认后，选中的问答将进入当前所属分类。'}</p></div></div>
    {document.generatedQaStatus === 'pending' && <div className="knowledge-centered-state"><IconLoading /><strong>正在生成问答</strong></div>}
    {document.generatedQaStatus === 'failed' && <div className="knowledge-centered-state"><IconExclamationCircle /><strong>问答生成失败</strong><span>文件仍可正常参与知识检索。</span><Button type="primary" onClick={onRegenerate}>重新生成</Button></div>}
    {document.generatedQaStatus === 'empty' && <div className="knowledge-centered-state"><strong>暂无可确认结果</strong><span>未从文件中识别出适合生成问答的内容。</span><Button onClick={onRegenerate}>重新生成</Button></div>}
    {(document.generatedQaStatus === 'completed' || confirmed) && <div className="knowledge-candidate-list">{candidates.map((candidate) => {
      const existing = candidate.existingQaId ? qas.find((qa) => qa.id === candidate.existingQaId) : undefined;
      return <section className="knowledge-candidate-card" key={candidate.id}><Checkbox checked={candidate.selected} disabled={confirmed} onChange={(selected) => updateCandidate(candidate.id, { selected })} /><div className="knowledge-candidate-content"><Input value={candidate.question} disabled={confirmed} onChange={(question) => updateCandidate(candidate.id, { question })} /><Input.TextArea value={candidate.answerText} disabled={confirmed} autoSize={{ minRows: 3, maxRows: 6 }} onChange={(answerText: string) => updateCandidate(candidate.id, { answerText, answerHtml: `<p>${answerText}</p>` })} />{existing && <div className="knowledge-conflict"><strong>检测到相似问题</strong><p>已有答案：{existing.answerText}</p><div><button type="button" disabled={confirmed} className={candidate.resolution === 'keep' ? 'active' : ''} onClick={() => updateCandidate(candidate.id, { resolution: 'keep' })}>保留已有答案</button><button type="button" disabled={confirmed} className={candidate.resolution === 'update' ? 'active' : ''} onClick={() => updateCandidate(candidate.id, { resolution: 'update' })}>使用新答案更新</button></div></div>}</div></section>;
    })}</div>}
  </Drawer>;
}
