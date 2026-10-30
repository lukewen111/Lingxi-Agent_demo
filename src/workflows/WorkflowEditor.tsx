import { memo, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, Handle, Position, applyNodeChanges, useReactFlow, MarkerType, useUpdateNodeInternals, useNodesInitialized } from '@xyflow/react';
import type { Connection, NodeProps, NodeChange } from '@xyflow/react';
import { IconArrowLeft, IconBranch, IconCheck, IconClose, IconCode, IconDelete, IconEdit, IconExclamationCircle, IconMessage, IconPlus, IconRobot, IconSend, IconPlayArrow, IconClockCircle } from '@arco-design/web-react/icon';
import { Button, Drawer, Empty, Input, Message, Modal, Tooltip, Tag } from '../components/ui';
import { NodeForm } from './NodeForm';
import { useAppStore } from '../store';
import { SaveIndicator, WorkflowBasicsModal, WorkflowStatus } from './WorkflowPages';
import { connectNodes, hasChanges, makeNode, nodeLabels, validateWorkflow, nodePorts, infoItems, branches } from './model';
import type { NodeKind, Workflow, WorkflowDraft, WorkflowNode, WorkflowIssue } from './model';
import { retrieveNodeKnowledge } from '../knowledge/retrieval';
import '@xyflow/react/dist/style.css';
import './workflow.css';

const formatDate = (value: string) => value.replace('T', ' ').slice(0, 16);
const nodeIcons = { start: IconPlayArrow, end: IconCheck, ai: IconRobot, collect: IconMessage, api: IconCode, condition: IconBranch, reply: IconSend, wait: IconClockCircle };
const groups: { title: string; nodes: NodeKind[] }[] = [{ title: '任务', nodes: ['ai'] }, { title: '信息', nodes: ['collect', 'api'] }, { title: '判断', nodes: ['condition'] }, { title: '动作', nodes: ['reply', 'wait'] }, { title: '流程控制', nodes: ['end'] }];
function nodeSummary(node: WorkflowNode['data']) {
  const config = node.config;
  if (node.kind === 'collect') return infoItems(config).map((item) => item.name).join('、') || '配置信息项';
  if (node.kind === 'api') return config.url ? `${config.method} ${config.url}` : '配置请求与出参';
  if (node.kind === 'condition') return branches(config).map((branch) => branch.name).join('、');
  if (node.kind === 'wait') return config.expected || '配置等待业务结果';
  return config.goal || config.prompt || config.content || config.message || '';
}
const CanvasNode = memo(function CanvasNode({ id, data, selected, isConnectable }: NodeProps<WorkflowNode>) {
  const Icon = nodeIcons[data.kind];
  const ports = nodePorts({ data } as WorkflowNode);
  const signature = ports.map((port) => port.id).join(',');
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => { updateNodeInternals(id); }, [id, signature, updateNodeInternals]);
  const terminal = data.kind === 'start' || data.kind === 'end';
  return <div style={ports.length > 1 ? { height: 84 + ports.length * 28 } : undefined} className={`wf-node wf-node-${data.kind}${terminal ? ' wf-node-terminal' : ''}${selected ? ' is-selected' : ''}${data.invalid ? ' is-invalid' : ''}`}>
    {data.kind !== 'start' && <Handle type="target" position={Position.Left} id="in" isConnectable={isConnectable} />}
    <div className="wf-node-title"><span className={`wf-node-icon wf-kind-${data.kind}`}><Icon /></span><strong title={data.label}>{data.label}</strong>{data.invalid && <IconExclamationCircle className="wf-error-icon" />}</div>
    {!terminal && <div className="wf-node-summary">{nodeSummary(data)}</div>}
    {ports.map((port, index) => <div key={port.id}>{ports.length > 1 && <span className="wf-port-label" style={{ top: 78 + index * 28 }}>{port.name}</span>}<Handle type="source" position={Position.Right} id={port.id} style={{ top: ports.length > 1 ? 88 + index * 28 : '50%' }} isConnectable={isConnectable} /></div>)}
  </div>;
});
const nodeTypes = { workflow: CanvasNode };

function EditorCanvas({ flow, readOnly, returnTo }: { flow: Workflow; readOnly: boolean; returnTo: string }) {
  const { state, dispatch, saveStatus } = useAppStore();
  const navigate = useNavigate();
  const rf = useReactFlow<WorkflowNode>();
  const initialized = useNodesInitialized();
  const fitted = useRef(false);
  useEffect(() => {
    if (!initialized || fitted.current) return;
    fitted.current = true;
    void rf.fitView({ padding: 0.16, maxZoom: 1 });
  }, [initialized, rf]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const draft = readOnly ? flow.published! : flow.draft;
  const [selectedId, setSelectedId] = useState<string>();
  const [edgeId, setEdgeId] = useState<string>();
  const [editingBasics, setEditingBasics] = useState(false);
  const [checked, setChecked] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(true);
  const [awaitingPublish, setAwaitingPublish] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [measurements, setMeasurements] = useState<Record<string, { width: number; height: number }>>({});
  const [testOpen, setTestOpen] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testResults, setTestResults] = useState<{ node: string; reply: string; source?: string }[]>([]);
  const folderIds = state.knowledgeFolders.filter((folder) => folder.level === 1).map((folder) => folder.id);
  const issues = checked && !readOnly ? validateWorkflow(draft, folderIds) : [];
  const selectedNode = draft.nodes.find((node) => node.id === selectedId);
  const selectedEdge = draft.edges.find((edge) => edge.id === edgeId);
  useEffect(() => {
    if (awaitingPublish && flow.published && !hasChanges(flow) && saveStatus === 'saved') { Message.success('工作流已发布'); setAwaitingPublish(false); }
  }, [awaitingPublish, flow, saveStatus]);
  const save = (next: WorkflowDraft) => { if (!readOnly) dispatch({ type: 'workflow.save', id: flow.id, draft: next }); };
  const updateNode = (node: WorkflowNode) => {
    const ports = nodePorts(node);
    let edges = draft.edges.filter((edge) => edge.source !== node.id || ports.some((port) => port.id === edge.sourceHandle));
    if (node.data.kind === 'wait' && Object.hasOwn(node.data.config, 'timeoutTarget')) {
      edges = edges.filter((edge) => edge.source !== node.id || edge.sourceHandle !== 'timeout');
      const target = draft.nodes.find((item) => item.id === node.data.config.timeoutTarget);
      if (target) edges.push(connectNodes(node, target, 'timeout'));
    }
    if (node.data.kind === 'wait') { const { timeoutTarget: _target, ...config } = node.data.config; node = { ...node, data: { ...node.data, config } }; }
    edges = edges.map((edge) => edge.source === node.id ? { ...edge, label: ports.find((port) => port.id === edge.sourceHandle)?.name || undefined } : edge);
    save({ ...draft, nodes: draft.nodes.map((item) => item.id === node.id ? node : item), edges });
  };
  const addNode = (kind: NodeKind, point?: { x: number; y: number }) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const position = point ?? rf.screenToFlowPosition({ x: (bounds?.left ?? 0) + (bounds?.width ?? 800) / 2 - 112, y: (bounds?.top ?? 0) + (bounds?.height ?? 500) / 2 - 55 });
    const node = makeNode(kind, position);
    save({ ...draft, nodes: [...draft.nodes, node] }); setSelectedId(node.id); setEdgeId(undefined); setPanelOpen(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/lingxi-workflow') as NodeKind;
    if (!readOnly && kind in nodeLabels && kind !== 'start') addNode(kind, rf.screenToFlowPosition({ x: event.clientX - 110, y: event.clientY - 30 }));
  };
  const canConnect = (connection: Connection | { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => {
    if (readOnly || connection.source === connection.target) return false;
    const source = draft.nodes.find((node) => node.id === connection.source);
    const target = draft.nodes.find((node) => node.id === connection.target);
    if (!source || !target || source.data.kind === 'end' || target.data.kind === 'start') return false;
    if (draft.edges.some((edge) => edge.source === connection.source && edge.sourceHandle === connection.sourceHandle)) return false;
    const visited = new Set<string>();
    const reachesSource = (id: string): boolean => {
      if (id === connection.source) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      return draft.edges.filter((edge) => edge.source === id).some((edge) => reachesSource(edge.target));
    };
    return !reachesSource(connection.target);
  };
  const connect = (connection: Connection) => {
    if (!canConnect(connection)) { Message.warning('该连线不可用，请检查方向、出口或循环'); return; }
    const source = draft.nodes.find((node) => node.id === connection.source)!;
    const target = draft.nodes.find((node) => node.id === connection.target)!;
    save({ ...draft, edges: [...draft.edges, connectNodes(source, target, connection.sourceHandle ?? 'out')] });
  };
  const changeNodes = (changes: NodeChange<WorkflowNode>[]) => {
    const dimensions = changes.filter((change) => change.type === 'dimensions' && change.dimensions);
    if (dimensions.length) setMeasurements((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const change of dimensions) if (change.type === 'dimensions' && change.dimensions && (previous[change.id]?.width !== change.dimensions.width || previous[change.id]?.height !== change.dimensions.height)) { next[change.id] = change.dimensions; changed = true; }
      return changed ? next : previous;
    });
    const positions = changes.filter((change) => change.type === 'position');
    if (positions.length && !readOnly) save({ ...draft, nodes: applyNodeChanges(positions, draft.nodes).map(({ dragging: _dragging, ...node }) => node) });
  };
  const removeSelection = () => {
    if (readOnly || selectedNode?.data.kind === 'start') return;
    Modal.confirm({ title: selectedNode ? '删除节点？' : '删除连线？', content: selectedNode ? `确认删除「${selectedNode.data.label}」及其连接线？` : '删除后可重新连接节点。', okText: '删除', okButtonProps: { status: 'danger' }, onOk: () => {
      save({ ...draft, nodes: draft.nodes.filter((node) => node.id !== selectedId), edges: draft.edges.filter((edge) => edge.id !== edgeId && edge.source !== selectedId && edge.target !== selectedId) });
      setSelectedId(undefined); setEdgeId(undefined);
    } });
  };
  const focusIssue = (issue: WorkflowIssue) => {
    if (!issue.nodeId) {
      if (issue.message.includes('名称') || issue.message.includes('触发提示词')) setEditingBasics(true);
      else { setSelectedId(undefined); setEdgeId(undefined); setPanelOpen(true); }
      return;
    }
    setSelectedId(issue.nodeId); setEdgeId(undefined); setPanelOpen(true);
    void rf.fitView({ nodes: [{ id: issue.nodeId }], duration: 300, maxZoom: 1, padding: 0.7 });
  };
  const publish = () => {
    setChecked(true); setIssuesOpen(true);
    const errors = validateWorkflow(draft, folderIds);
    if (errors.length) { focusIssue(errors[0]); Message.error(errors[0].message); return; }
    Modal.confirm({ title: '发布工作流？', content: `发布「${draft.name}」后，AI Agent 可绑定此流程。已绑定的 AI Agent 将使用本次发布内容。`, okText: '确认发布', onOk: () => { dispatch({ type: 'workflow.publish', id: flow.id }); setAwaitingPublish(true); } });
  };
  return <div className="wf-editor wf-editor-fullpage">
    <header className="wf-editor-header"><div className="wf-editor-heading"><Tooltip title={returnTo === '/workflows' ? '返回流程列表' : '返回 AI Agent'}><Button type="text" shape="circle" icon={<IconArrowLeft />} aria-label="返回" onClick={() => navigate(returnTo)} /></Tooltip><h1 title={draft.name}>{draft.name}</h1>{!readOnly && <Tooltip title="编辑基础信息"><Button type="text" icon={<IconEdit />} aria-label="编辑基础信息" onClick={() => setEditingBasics(true)} /></Tooltip>}{readOnly ? <Tag color="success">已发布版本</Tag> : <WorkflowStatus flow={flow} />}<span className="save-time">最近保存：{formatDate(flow.updatedAt)}</span></div>
      <div className="wf-editor-actions"><Button icon={<IconPlayArrow />} onClick={() => setTestOpen(true)}>测试运行</Button>{readOnly ? <Button onClick={() => navigate(`/workflows/${flow.id}`)}>编辑草稿</Button> : <><SaveIndicator /><Button type="primary" icon={<IconSend />} disabled={saveStatus !== 'saved' || !hasChanges(flow)} onClick={publish}>发布</Button></>}<Tooltip title={panelOpen ? '收起节点面板' : '展开节点面板'}><Button type="text" icon={panelOpen ? <IconClose /> : <IconPlus />} aria-label={panelOpen ? '收起节点面板' : '展开节点面板'} onClick={() => setPanelOpen(!panelOpen)} /></Tooltip></div>
    </header>
    <div className={`wf-editor-workspace${panelOpen ? ' has-panel' : ''}`}>
      <div className="wf-canvas" ref={canvasRef} onDrop={onDrop} onDragOver={(event) => { if (!readOnly) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}>
        <ReactFlow<WorkflowNode>
          nodes={draft.nodes.map((node) => ({ ...node, measured: measurements[node.id], selected: node.id === selectedId, data: { ...node.data, invalid: issues.some((issue) => issue.nodeId === node.id) } }))}
          edges={draft.edges.map((edge) => ({ ...edge, selected: edge.id === edgeId }))}
          nodeTypes={nodeTypes} onNodesChange={changeNodes} onConnect={connect} isValidConnection={canConnect}
          nodesDraggable={!readOnly} nodesConnectable={!readOnly} edgesReconnectable={false}
          onNodeClick={(_, node) => { setSelectedId(node.id); setEdgeId(undefined); setPanelOpen(true); }}
          onEdgeClick={(_, edge) => { setEdgeId(edge.id); setSelectedId(undefined); setPanelOpen(true); }}
          onPaneClick={() => { setSelectedId(undefined); setEdgeId(undefined); }}
          fitView fitViewOptions={{ padding: 0.12, maxZoom: 1 }} minZoom={0.2} maxZoom={1.8} deleteKeyCode={null}
          ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': '放大', 'controls.zoomOut.ariaLabel': '缩小', 'controls.fitView.ariaLabel': '适应画布', 'minimap.ariaLabel': '流程缩略图' }}
          defaultEdgeOptions={{ type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-muted-foreground)' }, style: { strokeWidth: 1.5 } }}>
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--color-border-strong)" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor="var(--color-primary-bg)" nodeStrokeColor="var(--color-border-strong)" maskColor="rgba(249,250,253,0.7)" />
        </ReactFlow>
        {!!issues.length && <div className="wf-issues"><button className="wf-issues-title" onClick={() => setIssuesOpen(!issuesOpen)}><IconExclamationCircle />{issues.length} 项配置待完善<span>{issuesOpen ? '收起' : '展开'}</span></button>{issuesOpen && <div className="wf-issues-list">{issues.map((issue, index) => <button key={`${issue.nodeId}-${index}`} onClick={() => focusIssue(issue)}>{issue.nodeId ? `${draft.nodes.find((node) => node.id === issue.nodeId)?.data.label}：` : ''}{issue.message}</button>)}</div>}</div>}
      </div>
      {panelOpen && <aside className="wf-panel">
        <div className="wf-panel-header"><h2>{selectedNode ? nodeLabels[selectedNode.data.kind] : selectedEdge ? '连线' : readOnly ? '流程信息' : '添加节点'}</h2>{(selectedNode || selectedEdge) && <Tooltip title="关闭配置"><Button type="text" icon={<IconClose />} aria-label="关闭节点配置" onClick={() => { setSelectedId(undefined); setEdgeId(undefined); }} /></Tooltip>}</div>
        <div className="wf-panel-body">
          {selectedNode ? <><NodeForm node={selectedNode} draft={draft} readOnly={readOnly} onChange={updateNode} />{!readOnly && selectedNode.data.kind !== 'start' && <Button danger icon={<IconDelete />} onClick={removeSelection}>删除节点</Button>}</> : selectedEdge ? <><p>{draft.nodes.find((node) => node.id === selectedEdge.source)?.data.label} → {draft.nodes.find((node) => node.id === selectedEdge.target)?.data.label}</p>{!readOnly && <Button danger icon={<IconDelete />} onClick={removeSelection}>删除连线</Button>}</> : readOnly ? <div className="wf-published-info"><span>触发提示词</span><p>{draft.trigger}</p><span>创建者</span><p>{flow.creator}</p><span>发布时间</span><p>{flow.publishedAt?.replace('T', ' ').slice(0, 16)}</p></div> : groups.map((group) => <section className="wf-node-group" key={group.title}><h3>{group.title}</h3>{group.nodes.map((kind) => { const Icon = nodeIcons[kind]; return <button className="wf-library-node" key={kind} draggable onDragStart={(event) => { event.dataTransfer.setData('application/lingxi-workflow', kind); event.dataTransfer.effectAllowed = 'move'; }} onClick={() => addNode(kind)}><span className={`wf-node-icon wf-kind-${kind}`}><Icon /></span><span>{nodeLabels[kind]}</span><IconPlus className="wf-library-add" /></button>; })}</section>)}
        </div>
      </aside>}
    </div>
    {editingBasics && <WorkflowBasicsModal initial={draft} onClose={() => setEditingBasics(false)} onSubmit={(name, trigger) => { save({ ...draft, name, trigger }); setEditingBasics(false); }} />}
    <Drawer open={testOpen} width={480} title="测试运行" onCancel={() => setTestOpen(false)} footer={null}><div className="wf-test-panel"><Input.TextArea rows={4} value={testInput} onChange={setTestInput} placeholder="输入用户问题，例如：退款多久到账？" /><Button type="primary" icon={<IconPlayArrow />} onClick={() => { if (!testInput.trim()) return Message.warning('请输入测试问题'); const results = draft.nodes.filter((node) => node.data.kind === 'ai' || node.data.kind === 'reply').map((node) => { const hit = retrieveNodeKnowledge(state, node.data.config, testInput); return { node: node.data.label, reply: hit?.answer || node.data.config.content || node.data.config.message || '当前节点未命中知识。', source: hit?.source }; }); setTestResults(results); }}>运行</Button><div className="wf-test-results">{testResults.map((result, index) => <section key={`${result.node}-${index}`}><strong>{result.node}</strong><p>{result.reply}</p>{result.source && <span>知识来源：{result.source}</span>}</section>)}</div></div></Drawer>
  </div>;
}

export function WorkflowEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { state } = useAppStore();
  const navigate = useNavigate();
  const flow = state.workflows.find((item) => item.id === id);
  const readOnly = params.get('version') === 'published';
  const agentId = params.get('agent');
  const returnTo = agentId && state.agents.some((agent) => agent.id === agentId) ? `/agents/${encodeURIComponent(agentId)}/workflow` : '/workflows';
  if (!flow || (readOnly && !flow.published)) return <div className="page-content"><Empty description={!flow ? '工作流不存在' : '该工作流尚未发布'}><Button onClick={() => navigate(returnTo)}>返回</Button></Empty></div>;
  return <ReactFlowProvider key={`${flow.id}-${readOnly}`}><EditorCanvas flow={flow} readOnly={readOnly} returnTo={returnTo} /></ReactFlowProvider>;
}
