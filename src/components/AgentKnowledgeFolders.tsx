import { useState } from 'react';
import { Button, Checkbox, Empty, Input, Message, Modal, Table } from './ui';
import { IconDelete, IconFolder, IconPlus } from '@arco-design/web-react/icon';
import { useAppStore } from '../store';
import type { Agent, KnowledgeFolder } from '../types';

export function AgentKnowledgeFolders({ agent }: { agent: Agent }) {
  const { state, dispatch } = useAppStore();
  const [open, setOpen] = useState(false);
  const [pageQuery, setPageQuery] = useState('');
  const [pickerQuery, setPickerQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(agent.draft.knowledgeIds);
  const folders = state.knowledgeFolders.filter((folder) => folder.level === 1);
  const attached = folders.filter((folder) => agent.draft.knowledgeIds.includes(folder.id));
  const visible = attached.filter((folder) => folder.name.toLowerCase().includes(pageQuery.toLowerCase()));
  const pickerFolders = folders.filter((folder) => folder.name.toLowerCase().includes(pickerQuery.toLowerCase()));
  const closePicker = () => { setOpen(false); setPickerQuery(''); };
  const save = () => { dispatch({ type: 'agent.config', id: agent.id, config: { ...agent.draft, knowledgeIds: selected } }); closePicker(); Message.success('知识库绑定已保存到草稿'); };
  const detach = (folder: KnowledgeFolder) => Modal.confirm({ title: '解除绑定？', content: `解除后，当前 AI 客服将不再使用「${folder.name}」中的知识。`, onOk: () => { dispatch({ type: 'agent.config', id: agent.id, config: { ...agent.draft, knowledgeIds: agent.draft.knowledgeIds.filter((id) => id !== folder.id) } }); Message.success('知识库已解除绑定'); } });

  return <div className="detail-resource-page">
    <div className="detail-toolbar"><h1 className="resource-page-title">知识库</h1><Button type="primary" icon={<IconPlus />} onClick={() => { setSelected(agent.draft.knowledgeIds); setOpen(true); }}>绑定知识库</Button></div>
    <Input.Search className="resource-page-search" value={pageQuery} onChange={setPageQuery} allowClear placeholder="搜索知识库" />
    <Table rowKey="id" dataSource={visible} pagination={false} noDataElement={<Empty description={attached.length ? '未找到知识库' : '当前 AI 客服尚未绑定知识库'} />} columns={[
      { title: '知识库名称', dataIndex: 'name', render: (value: string) => <div className="module-name-cell knowledge-folder-name"><IconFolder /><strong>{value}</strong></div> },
      { title: '最近更新', dataIndex: 'updatedAt', render: (value: string) => value.replace('T', ' ').slice(0, 16) },
      { title: '操作', width: 64, render: (_: unknown, folder: KnowledgeFolder) => <Button type="text" danger icon={<IconDelete />} aria-label={`解除绑定：${folder.name}`} onClick={() => detach(folder)} /> },
    ]} />
    <Modal open={open} title="绑定知识库" onCancel={closePicker} onOk={save} okText="绑定" okButtonProps={{ disabled: !selected.length }} className="resource-picker-modal">
      <Input.Search value={pickerQuery} onChange={setPickerQuery} allowClear placeholder="搜索知识库" />
      <div className="resource-picker-list document-picker-list knowledge-folder-picker-list">
        {pickerFolders.map((folder) => <Checkbox key={folder.id} checked={selected.includes(folder.id)} onChange={(checked) => setSelected((items) => checked ? [...items, folder.id] : items.filter((id) => id !== folder.id))}>
          <span className="resource-picker-row-main"><IconFolder /><strong>{folder.name}</strong></span>
        </Checkbox>)}
      </div>
      {!pickerFolders.length && <Empty description="暂无可绑定知识库" />}
    </Modal>
  </div>;
}
