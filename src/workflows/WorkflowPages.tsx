import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconBranch, IconDelete, IconMore, IconPlus, IconRefresh, IconCheck, IconLoading } from '@arco-design/web-react/icon';
import { Button, Checkbox, Dropdown, Empty, Form, Input, Menu, Message, Modal, Table, Tag, Tooltip } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { AgentAvatar } from '../components/AgentAvatar';
import { useAppStore } from '../store';
import type { Agent } from '../types';
import { makeWorkflow, snapshot, workflowStatus, hasChanges, validateWorkflow } from './model';
import type { Workflow } from './model';
import './workflow.css';

const formatDate = (value: string) => value.replace('T', ' ').slice(0, 16);

export function WorkflowStatus({ flow }: { flow: Workflow }) {
  return <Tooltip title={flow.published && hasChanges(flow) ? '修改尚未发布，AI Agent 继续使用已发布版本' : workflowStatus(flow)}><span><Tag color={flow.published ? 'success' : 'gray'}>{workflowStatus(flow)}</Tag></span></Tooltip>;
}

export function SaveIndicator() {
  const { saveStatus, retrySave } = useAppStore();
  return <span className={`wf-save wf-save-${saveStatus}`} role="status">{saveStatus === 'error' ? <><span>保存失败</span><Tooltip title="重试保存"><Button type="text" icon={<IconRefresh />} aria-label="重试保存" onClick={retrySave} /></Tooltip></> : <>{saveStatus === 'saving' ? <IconLoading /> : <IconCheck />}{saveStatus === 'saving' ? '保存中' : '已保存'}</>}</span>;
}

export function WorkflowBasicsModal({ initial, onClose, onSubmit }: { initial?: { name: string; trigger: string }; onClose: () => void; onSubmit: (name: string, trigger: string) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [trigger, setTrigger] = useState(initial?.trigger ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setSubmitted(true);
    if (!name.trim() || !trigger.trim()) return;
    setBusy(true);
    try { onSubmit(name.trim(), trigger.trim()); } catch { Message.error('操作失败，请重试'); } finally { setBusy(false); }
  };
  return <Modal open title={initial ? '编辑基础信息' : '创建工作流'} onCancel={onClose} onOk={submit} confirmLoading={busy} okText={initial ? '保存' : '创建并配置'} style={{ maxWidth: 'calc(100vw - 32px)' }} width={560}>
    <Form layout="vertical">
      <Form.Item label={<label htmlFor="wf-name">工作流名称</label>} required validateStatus={submitted && !name.trim() ? 'error' : undefined} help={submitted && !name.trim() ? '请输入工作流名称' : undefined}>
        <Input id="wf-name" autoFocus maxLength={50} value={name} onChange={setName} placeholder="例如：订单进度查询" />
      </Form.Item>
      <Form.Item label={<label htmlFor="wf-trigger">触发提示词</label>} required validateStatus={submitted && !trigger.trim() ? 'error' : undefined} help={submitted && !trigger.trim() ? '请输入触发提示词' : undefined}>
        <Input.TextArea id="wf-trigger" maxLength={500} showCount rows={5} value={trigger} onChange={setTrigger} placeholder="描述 AI Agent 应何时使用此流程，例如：用户询问订单状态或物流进度时。" />
      </Form.Item>
    </Form>
  </Modal>;
}

export function WorkflowsPage() {
  const { state, dispatch, saveStatus } = useAppStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Workflow>();
  const [viewBindings, setViewBindings] = useState<Workflow>();
  const flows = state.workflows.filter((flow) => flow.draft.name.toLowerCase().includes(query.trim().toLowerCase()));
  const bindings = removing ? state.agents.filter((agent) => agent.draft.workflowIds?.includes(removing.id) || agent.published?.workflowIds?.includes(removing.id)) : [];
  const copy = (flow: Workflow) => {
    const copied = makeWorkflow(`${flow.draft.name.slice(0, 47)} 副本`, flow.draft.trigger);
    copied.creator = state.session?.username ?? copied.creator;
    copied.draft.nodes = snapshot(flow.draft.nodes); copied.draft.edges = snapshot(flow.draft.edges);
    dispatch({ type: 'workflow.add', workflow: copied }); setPage(1); Message.success('已复制为草稿');
  };
  const boundAgents = (flow: Workflow) => state.agents.filter((agent) => agent.draft.workflowIds?.includes(flow.id) || agent.published?.workflowIds?.includes(flow.id));
  const publish = (flow: Workflow) => {
    const errors = validateWorkflow(flow.draft, state.documents.filter((doc) => doc.status === 'success').map((doc) => doc.id));
    if (errors.length) { Modal.confirm({ title: '发布校验未通过', content: <ul>{errors.map((issue, index) => <li key={index}>{issue.nodeId ? `${flow.draft.nodes.find((node) => node.id === issue.nodeId)?.data.label}：` : ''}{issue.message}</li>)}</ul>, okText: '前往配置', onOk: () => navigate(`/workflows/${flow.id}`) }); return; }
    Modal.confirm({ title: '发布工作流？', content: `发布「${flow.draft.name}」后，已绑定的 AI Agent 将使用本次发布内容。`, okText: '确认发布', onOk: () => { dispatch({ type: 'workflow.publish', id: flow.id }); Message.success('工作流已发布'); } });
  };
  return <div className="page-content module-page wf-list-page">
    <PageHeader title="工作流" actions={<Button type="primary" icon={<IconPlus />} onClick={() => setCreating(true)}>创建工作流</Button>} />
    <div className="wf-list-toolbar"><Input.Search value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="搜索工作流名称" allowClear />{saveStatus === 'error' && <SaveIndicator />}</div>
    <Table rowKey="id" dataSource={flows} scroll={{ x: 870 }} pagination={{ current: Math.min(page, Math.max(1, Math.ceil(flows.length / 10))), pageSize: 10, total: flows.length, showTotal: true, onChange: setPage }} noDataElement={<Empty icon={<IconBranch />} description={query ? '未找到匹配的工作流' : '暂无工作流'}>{!query && <Button type="primary" onClick={() => setCreating(true)}>创建工作流</Button>}</Empty>} columns={[
      { title: '工作流名称', width: 240, render: (_: unknown, flow: Workflow) => <div className="wf-name-cell"><span className="wf-resource-icon"><IconBranch /></span><Tooltip title={flow.draft.name}><button className="wf-name-link" onClick={() => navigate(`/workflows/${flow.id}`)}>{flow.draft.name}</button></Tooltip></div> },
      { title: '状态', width: 100, render: (_: unknown, flow: Workflow) => <WorkflowStatus flow={flow} /> },
      { title: '绑定 AI Agent', width: 190, render: (_: unknown, flow: Workflow) => { const agents = boundAgents(flow); return agents.length ? <Button type="text" className="wf-binding-link" onClick={() => setViewBindings(flow)}><span className="wf-binding-avatars">{agents.slice(0, 3).map((agent) => <AgentAvatar key={agent.id} agent={agent} />)}</span><span>{agents.length === 1 ? agents[0].name : `${agents.length} 个 AI Agent`}</span></Button> : <span className="wf-muted">未绑定</span>; } },
      { title: '创建人', dataIndex: 'creator', width: 100 },
      { title: '更新时间', dataIndex: 'updatedAt', width: 168, render: formatDate },
      { title: '操作', width: 72, fixed: 'right', render: (_: unknown, flow: Workflow) => <Dropdown trigger="click" droplist={<Menu>
        <Menu.Item key="edit" onClick={() => navigate(`/workflows/${flow.id}`)}>编辑</Menu.Item>
        <Menu.Item key="copy" onClick={() => copy(flow)}>复制</Menu.Item>
        <Menu.Item key="publish" disabled={!hasChanges(flow) || saveStatus !== 'saved'} onClick={() => publish(flow)}>发布</Menu.Item>
        <Menu.Item key="delete" className="danger-menu-item" onClick={() => setRemoving(flow)}>删除</Menu.Item>
      </Menu>}><Button type="text" className="table-more-button" icon={<IconMore />} aria-label={`${flow.draft.name} 更多操作`} /></Dropdown> },
    ]} />
    <Modal open={Boolean(viewBindings)} title={`${viewBindings?.draft.name ?? ''} - 绑定 AI Agent`} onCancel={() => setViewBindings(undefined)} footer={<Button onClick={() => setViewBindings(undefined)}>关闭</Button>}><div className="wf-bound-agents">{viewBindings && boundAgents(viewBindings).map((agent) => <Button type="text" key={agent.id} onClick={() => navigate(`/agents/${agent.id}/workflow`)}>{agent.name}</Button>)}</div></Modal>
    {creating && <WorkflowBasicsModal onClose={() => setCreating(false)} onSubmit={(name, trigger) => { const flow = makeWorkflow(name, trigger); flow.creator = state.session?.username ?? flow.creator; dispatch({ type: 'workflow.add', workflow: flow }); setCreating(false); navigate(`/workflows/${flow.id}`); }} />}
    <Modal open={Boolean(removing)} title={bindings.length ? '工作流正在被使用' : '删除工作流？'} onCancel={() => setRemoving(undefined)} okText={bindings.length ? '知道了' : '删除'} okButtonProps={{ status: bindings.length ? undefined : 'danger' }} onOk={() => { if (removing && !bindings.length) { dispatch({ type: 'workflow.delete', id: removing.id }); Message.success('工作流已删除'); } setRemoving(undefined); }}>
      {bindings.length ? <><p>请解除绑定后删除</p><div className="wf-bound-agents">{bindings.map((agent) => <Button type="text" key={agent.id} onClick={() => navigate(`/agents/${agent.id}/workflow`)}>{agent.name}</Button>)}</div></> : <p>确认删除「{removing?.draft.name}」？删除后无法恢复。</p>}
    </Modal>
  </div>;
}

export function AgentWorkflowSection({ agent }: { agent: Agent }) {
  const { state, dispatch, saveStatus } = useAppStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pickerQuery, setPickerQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [removing, setRemoving] = useState<Workflow>();
  const attachedIds = agent.draft.workflowIds ?? [];
  const matches = (flow: Workflow, value: string) => (flow.published?.name ?? '').toLowerCase().includes(value.trim().toLowerCase());
  const attached = state.workflows.filter((flow) => attachedIds.includes(flow.id));
  const available = state.workflows.filter((flow) => flow.published && !attachedIds.includes(flow.id));
  const visibleAvailable = available.filter((flow) => matches(flow, pickerQuery));
  const close = () => { setOpen(false); setSelected([]); setPickerQuery(''); };
  const view = (flow: Workflow) => navigate(`/workflows/${flow.id}?version=published&agent=${encodeURIComponent(agent.id)}`);
  return <div className="detail-resource-page wf-binding-page">
    <div className="detail-toolbar"><h1 className="resource-page-title">工作流</h1><Button type="primary" icon={<IconPlus />} onClick={() => setOpen(true)}>绑定工作流</Button></div>
    <Input.Search className="resource-page-search" value={query} onChange={setQuery} placeholder="搜索工作流名称" allowClear />
    {saveStatus === 'error' && <SaveIndicator />}
    <Table rowKey="id" dataSource={attached.filter((flow) => matches(flow, query))} pagination={false} scroll={{ x: 540 }} noDataElement={<Empty icon={<IconBranch />} description={attached.length ? '未找到匹配的工作流' : '当前 AI Agent 尚未绑定工作流'} />} columns={[
      { title: '名称', width: 180, render: (_: unknown, flow: Workflow) => <div className="wf-name-cell"><span className="wf-resource-icon"><IconBranch /></span><Tooltip title={flow.published?.name}><button className="wf-name-link" onClick={() => view(flow)}>{flow.published?.name}</button></Tooltip></div> },
      { title: '触发提示词', render: (_: unknown, flow: Workflow) => <Tooltip title={flow.published?.trigger}><span className="wf-trigger-text">{flow.published?.trigger}</span></Tooltip> },
      { title: '创建人', dataIndex: 'creator', width: 90 },
      { title: '操作', width: 64, render: (_: unknown, flow: Workflow) => <div className="wf-row-actions"><Tooltip title="解绑工作流"><Button type="text" danger icon={<IconDelete />} aria-label={`解绑工作流：${flow.published?.name}`} onClick={() => setRemoving(flow)} /></Tooltip></div> },
    ]} />
    <Modal open={open} title="绑定工作流" className="resource-picker-modal" style={{ maxWidth: 'calc(100vw - 32px)' }} width={600} onCancel={close} okText="绑定" okButtonProps={{ disabled: !selected.length }} onOk={() => { dispatch({ type: 'agent.workflows', id: agent.id, workflowIds: [...attachedIds, ...selected] }); close(); Message.success('工作流已绑定'); }}>
      <Input.Search value={pickerQuery} onChange={setPickerQuery} placeholder="搜索工作流名称" allowClear />
      <div className="resource-picker-list wf-picker-list">{visibleAvailable.map((flow) => <Checkbox key={flow.id} checked={selected.includes(flow.id)} onChange={(checked) => setSelected((prev) => checked ? [...prev, flow.id] : prev.filter((id) => id !== flow.id))}><span className="resource-picker-row-main"><span className="wf-resource-icon"><IconBranch /></span><strong>{flow.published!.name}</strong></span></Checkbox>)}</div>
      {!visibleAvailable.length && <Empty description={pickerQuery ? '未找到匹配的已发布工作流' : '暂无可绑定的已发布工作流'} />}
    </Modal>
    <Modal open={Boolean(removing)} title="解绑工作流？" onCancel={() => setRemoving(undefined)} okText="解绑" okButtonProps={{ status: 'danger' }} onOk={() => { if (removing) dispatch({ type: 'agent.workflows', id: agent.id, workflowIds: attachedIds.filter((id) => id !== removing.id) }); setRemoving(undefined); Message.success('工作流已解绑'); }}>
      <p>确认解绑「{removing?.published?.name}」？发布 AI Agent 后生效，源工作流不会被删除。</p>
    </Modal>
  </div>;
}
