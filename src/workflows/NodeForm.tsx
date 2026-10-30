import { IconDelete, IconDown, IconPlus, IconUp } from '@arco-design/web-react/icon';
import { Button, Form, Input, Select, Switch, Upload } from '../components/ui';
import { useAppStore } from '../store';
import { ancestorIds, branches, infoItems, mappings, readList, upstreamVariables, workflowId } from './model';
import type { Branch, Mapping, WorkflowDraft, WorkflowNode } from './model';

export function NodeForm({ node, draft, readOnly, onChange }: { node: WorkflowNode; draft: WorkflowDraft; readOnly: boolean; onChange: (node: WorkflowNode) => void }) {
  const { state } = useAppStore();
  const { kind, config } = node.data;
  const set = (key: string, value: string) => onChange({ ...node, data: { ...node.data, config: { ...config, [key]: value } } });
  const list = (key: string, value: unknown[]) => set(key, JSON.stringify(value));
  const variables = upstreamVariables(draft, node.id);
  const field = (key: string, label: string, required = false, multiline = false, fallback = '') => <Form.Item key={key} label={<label htmlFor={`wf-config-${key}`}>{label}</label>} required={required}>
    {multiline ? <Input.TextArea id={`wf-config-${key}`} value={config[key] ?? fallback} onChange={(value: string) => set(key, value)} rows={3} readOnly={readOnly} /> : <Input id={`wf-config-${key}`} value={config[key] ?? fallback} onChange={(value: string) => set(key, value)} readOnly={readOnly} />}
  </Form.Item>;
  const select = (key: string, label: string, options: { label: string; value: string }[], fallback?: string, required = false) => {
    const value = config[key] ?? fallback;
    const legacyOption = key === 'source' && value && !value.includes(':') ? options.find((option) => option.value.endsWith(`:${value}`)) : undefined;
    return <Form.Item label={label} required={required}><Select aria-label={label} disabled={readOnly} value={value} placeholder="请选择" options={legacyOption ? [...options, { ...legacyOption, value: value! }] : options} onChange={(next) => set(key, next)} /></Form.Item>;
  };
  const knowledge = <Form.Item label="知识库"><Select aria-label="知识库" mode="multiple" disabled={readOnly} allowClear placeholder="选择知识库" value={readList<string>(config.knowledgeIds)} options={state.knowledgeFolders.filter((folder) => folder.level === 1).map((folder) => ({ label: folder.name, value: folder.id }))} onChange={(value) => list('knowledgeIds', value)} /></Form.Item>;
  const mappingEditor = (key: string, title: string, required = false, legacy?: string) => {
    const rows = mappings(config, key, legacy);
    const update = (id: string, patch: Partial<Mapping>) => list(key, rows.map((row) => row.id === id ? { ...row, ...patch } : row));
    return <Form.Item label={title} required={required}>
      <div className="wf-mapping-list">{rows.map((row, index) => <div className="wf-config-card" key={row.id}>
        <div className="wf-config-card-heading"><span>{title} {index + 1}</span>{!readOnly && <Button type="text" danger size="mini" aria-label={`移除${title} ${index + 1}`} icon={<IconDelete />} onClick={() => list(key, rows.filter((item) => item.id !== row.id))} />}</div>
        <Input aria-label={`${title}名称 ${index + 1}`} placeholder="名称" value={row.name} readOnly={readOnly} onChange={(name: string) => update(row.id, { name })} />
        <Input aria-label={`${title}值 ${index + 1}`} placeholder={key === 'outputs' ? '结果值／提取路径，如 $.status' : '值，可引用前置信息'} value={row.value} readOnly={readOnly} onChange={(value: string) => update(row.id, { value })} />
        {key === 'inputs' && !readOnly && <Select aria-label={`入参引用 ${index + 1}`} value={undefined} placeholder="引用前置信息" options={variables} onChange={(value) => update(row.id, { value: `{{${value}}}` })} />}
      </div>)}</div>
      {!readOnly && <Button type="text" icon={<IconPlus />} onClick={() => list(key, [...rows, { id: workflowId(), name: '', value: '' }])}>添加{title}</Button>}
      {readOnly && !rows.length && <span className="wf-muted">未配置</span>}
    </Form.Item>;
  };
  const branchList = branches(config);
  const updateBranch = (id: string, patch: Partial<Branch>) => list('branches', branchList.map((branch) => branch.id === id ? { ...branch, ...patch } : branch));
  const moveBranch = (index: number, direction: number) => { const next = [...branchList]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; list('branches', next); };
  if (kind === 'start') return <p className="wf-muted">流程从此处开始</p>;
  return <Form layout="vertical" className="wf-node-form">
    <Form.Item label={<label htmlFor="wf-node-name">节点名称</label>} required><Input id="wf-node-name" value={node.data.label} readOnly={readOnly} onChange={(label: string) => onChange({ ...node, data: { ...node.data, label } })} /></Form.Item>
    {kind === 'ai' && <>{field('goal', '任务目标', true, true, config.prompt)}{field('instructions', '任务说明', false, true)}{knowledge}{field('completion', '完成条件', false, true)}{mappingEditor('outputs', '任务结果')}</>}
    {kind === 'collect' && <>
      <Form.Item label="信息项" required>{infoItems(config).map((item, index, items) => <div className="wf-config-card" key={item.id}>
        <div className="wf-config-card-heading"><strong>信息项 {index + 1}</strong>{!readOnly && <Button type="text" danger icon={<IconDelete />} aria-label={`移除信息项 ${index + 1}`} onClick={() => list('items', items.filter((row) => row.id !== item.id))} />}</div>
        <Input aria-label={`信息名称 ${index + 1}`} placeholder="信息名称，如 order_id" value={item.name} readOnly={readOnly} onChange={(name: string) => list('items', items.map((row) => row.id === item.id ? { ...row, name } : row))} />
        <Select aria-label={`信息类型 ${index + 1}`} value={item.type} disabled={readOnly} options={[{ label: '文本', value: 'text' }, { label: '数字', value: 'number' }, { label: '布尔值', value: 'boolean' }]} onChange={(type) => list('items', items.map((row) => row.id === item.id ? { ...row, type } : row))} />
        <div className="wf-config-card-heading"><span>是否必填</span><Switch aria-label={`信息必填 ${index + 1}`} disabled={readOnly} checked={item.required} onChange={(required) => list('items', items.map((row) => row.id === item.id ? { ...row, required } : row))} /></div>
      </div>)}{!readOnly && <Button type="text" icon={<IconPlus />} onClick={() => list('items', [...infoItems(config), { id: workflowId(), name: '', type: 'text', required: true }])}>添加信息项</Button>}</Form.Item>
      {field('question', '首次询问内容', false, true)}
    </>}
    {kind === 'api' && <>{select('method', '请求方式', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({ label: value, value })), 'GET', true)}{field('url', '接口地址', true)}{mappingEditor('headers', '请求头')}{mappingEditor('inputs', '入参', true, 'parameters')}{field('body', '请求 Body', false, true)}{mappingEditor('outputs', '出参', true, 'result')}</>}
    {kind === 'condition' && <>
      {branchList.map((branch, index) => <section className="wf-config-card" key={branch.id}>
        <div className="wf-config-card-heading"><strong>分支 {index + 1}</strong>{!readOnly && <div className="wf-compact-actions">
          <Button type="text" size="mini" disabled={index === 0} aria-label={`上移分支 ${index + 1}`} icon={<IconUp />} onClick={() => moveBranch(index, -1)} />
          <Button type="text" size="mini" disabled={index === branchList.length - 1} aria-label={`下移分支 ${index + 1}`} icon={<IconDown />} onClick={() => moveBranch(index, 1)} />
          <Button type="text" size="mini" danger disabled={branchList.length === 1} aria-label={`删除分支 ${index + 1}`} icon={<IconDelete />} onClick={() => list('branches', branchList.filter((item) => item.id !== branch.id))} />
        </div>}</div>
        <Form.Item label="分支名称" required><Input aria-label={`分支名称 ${index + 1}`} value={branch.name} readOnly={readOnly} onChange={(name: string) => updateBranch(branch.id, { name })} /></Form.Item>
        <Form.Item label="组合条件"><Select aria-label={`组合条件 ${index + 1}`} value={branch.combination} disabled={readOnly} options={[{ value: 'AND', label: 'AND · 全部满足' }, { value: 'OR', label: 'OR · 任一满足' }]} onChange={(combination) => updateBranch(branch.id, { combination })} /></Form.Item>
        {branch.rules.map((rule, ruleIndex) => {
          const update = (patch: Partial<typeof rule>) => updateBranch(branch.id, { rules: branch.rules.map((item, i) => i === ruleIndex ? { ...item, ...patch } : item) });
          const options = [...variables];
          if (rule.field && !options.some((option) => option.value === rule.field) && variables.some((option) => option.value.endsWith(`:${rule.field}`))) options.push({ label: rule.field, value: rule.field });
          return <div className="wf-rule" key={ruleIndex}>
            <Form.Item label="判断信息" required><Select aria-label={`判断信息 ${index + 1}-${ruleIndex + 1}`} disabled={readOnly} placeholder="选择前置节点输出" value={rule.field || undefined} options={options} onChange={(value) => update({ field: value })} /></Form.Item>
            <Form.Item label="判断关系" required><Select aria-label={`判断关系 ${index + 1}-${ruleIndex + 1}`} disabled={readOnly} value={rule.operator} options={[{ value: 'equals', label: '等于' }, { value: 'notEquals', label: '不等于' }, { value: 'contains', label: '包含' }, { value: 'greater', label: '大于' }, { value: 'less', label: '小于' }]} onChange={(operator) => update({ operator })} /></Form.Item>
            <Form.Item label="判断值" required><Input aria-label={`判断值 ${index + 1}-${ruleIndex + 1}`} readOnly={readOnly} value={rule.value} onChange={(value: string) => update({ value })} /></Form.Item>
            {!readOnly && branch.rules.length > 1 && <Button type="text" danger onClick={() => updateBranch(branch.id, { rules: branch.rules.filter((_, i) => i !== ruleIndex) })}>移除此条件</Button>}
          </div>;
        })}
        {!readOnly && <Button type="text" icon={<IconPlus />} onClick={() => updateBranch(branch.id, { rules: [...branch.rules, { field: '', operator: 'equals', value: '' }] })}>添加条件</Button>}
      </section>)}
      {!readOnly && <Button type="text" icon={<IconPlus />} onClick={() => list('branches', [...branchList, { id: workflowId(), name: `分支 ${branchList.length + 1}`, combination: 'AND', rules: [{ field: '', operator: 'equals', value: '' }] }])}>添加分支</Button>}
      <div className="wf-config-card wf-muted">其他情况</div>
    </>}
    {kind === 'reply' && <>{select('mode', '回复方式', [{ value: 'fixed', label: '固定回复' }, { value: 'ai', label: 'AI回复' }], 'fixed', true)}{field('content', '回复内容', true, true)}
      <Form.Item label="插入信息"><Select aria-label="插入信息" disabled={readOnly} placeholder="选择前置节点输出" value={undefined} options={variables} onChange={(value) => set('content', `${config.content ?? ''}{{${value}}}`)} /></Form.Item>
      <Form.Item label="附件"><Upload disabled={readOnly} autoUpload={false} multiple fileList={readList<{ uid: string; name: string; status: 'done' }>(config.attachments)} onChange={(files) => list('attachments', files.map((file) => ({ uid: file.uid, name: file.name, status: 'done' })))} /></Form.Item>{knowledge}
    </>}
    {kind === 'wait' && <>{select('source', '等待内容', variables, undefined, true)}{field('expected', '等待结果', true)}<Form.Item label="最长等待时间"><Input aria-label="最长等待时间" type="number" min={1} suffix="分钟" value={config.timeout ?? ''} readOnly={readOnly} onChange={(value: string) => set('timeout', value)} /></Form.Item>
      <Form.Item label="超时处理"><Select aria-label="超时处理" disabled={readOnly} placeholder="选择后续节点" allowClear value={draft.edges.find((edge) => edge.source === node.id && edge.sourceHandle === 'timeout')?.target} options={draft.nodes.filter((item) => item.id !== node.id && item.data.kind !== 'start' && !ancestorIds(draft, node.id).has(item.id)).map((item) => ({ value: item.id, label: item.data.label }))} onChange={(value) => set('timeoutTarget', value ?? '')} /></Form.Item>
    </>}
  </Form>;
}
