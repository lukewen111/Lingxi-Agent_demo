import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Spin, Message, Tabs } from '@arco-design/web-react';
import { IconClose, IconDownload, IconFile, IconRefresh, IconUpload } from '@arco-design/web-react/icon';
import { Button } from '../components/ui';
import type { KnowledgeDocument } from '../types';
import { downloadOriginal, getOriginal } from './fileStorage';
import './preview.css';

export function FilePreview({ document, onClose, onUpdate }: { document: KnowledgeDocument; onClose: () => void; onUpdate?: (document: KnowledgeDocument) => void }) {
  const [blob, setBlob] = useState<Blob>(); const [url, setUrl] = useState(''); const [text, setText] = useState<string>(); const [failed, setFailed] = useState(false); const [sheet, setSheet] = useState('商品库存');
  const [loading, setLoading] = useState(true); const [attempt, setAttempt] = useState(0); const [downloading, setDownloading] = useState(false);
  const panel = useRef<HTMLDivElement>(null); const close = useRef(onClose); close.current = onClose;
  const type = document.type.toUpperCase();
  useEffect(() => {
    let active = true; let objectUrl = '';
    setLoading(true); setFailed(false); setBlob(undefined); setText(undefined); setUrl(''); setSheet('商品库存');
    void (async () => {
      try {
        const original = await getOriginal(document.id);
        if (!active) return;
        if (!original && document.originalStored) throw new Error('原文件不可用');
        const originalText = original && ['TXT', 'MD'].includes(type) ? await original.text() : undefined;
        if (!active) return;
        if (original && type === 'PDF') objectUrl = URL.createObjectURL(original.slice(0, original.size, 'application/pdf'));
        setBlob(original); setText(originalText); setUrl(objectUrl); setLoading(false);
      } catch { if (active) { setFailed(true); setLoading(false); } }
    })();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [document.id, document.originalStored, type, attempt]);
  useEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null;
    const overflow = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden'; panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), iframe, [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length);
      const first = elements[0]; const last = elements[elements.length - 1]; const focused = window.document.activeElement;
      if (!first) { event.preventDefault(); panel.current?.focus(); }
      else if (event.shiftKey && (focused === first || focused === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (focused === last || focused === panel.current)) { event.preventDefault(); first.focus(); }
    };
    window.document.addEventListener('keydown', onKey, true);
    return () => { window.document.removeEventListener('keydown', onKey, true); window.document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  const download = async () => {
    setDownloading(true);
    try { await downloadOriginal(document); }
    catch (error) { Message.error(error instanceof Error ? error.message : '下载失败，请重试。'); }
    finally { setDownloading(false); }
  };
  const source = text ?? document.previewText ?? document.content;
  const markdown = useMemo(() => source.replace(/\r\n?/g, '\n').split('\n'), [source]);
  const filename = document.name.toLowerCase().endsWith(`.${type.toLowerCase()}`) ? document.name : `${document.name}.${type.toLowerCase()}`;
  return createPortal(<div className="knowledge-preview" role="dialog" aria-modal="true" aria-label={`${filename} 文件预览`} ref={panel} tabIndex={-1}>
    <header className="knowledge-preview-header"><Button type="text" className="knowledge-preview-close" icon={<IconClose />} aria-label="关闭预览" onClick={onClose} /><strong title={filename}>{filename}</strong>{(onUpdate || blob || document.originalStored || failed) && <div>{onUpdate && <Button icon={<IconUpload />} onClick={() => onUpdate(document)}>更新文件</Button>}{(blob || document.originalStored || failed) && <Button icon={<IconDownload />} loading={downloading} onClick={() => void download()}>下载原文件</Button>}</div>}</header>
    <main className="knowledge-preview-canvas" aria-busy={loading}>
      {loading && <div className="knowledge-preview-error" role="status"><Spin /><span>正在加载预览…</span></div>}
      {failed ? <div className="knowledge-preview-error" role="alert"><IconFile /><strong>文件预览加载失败</strong><span>可以重新加载或下载原文件。</span><div><Button icon={<IconRefresh />} onClick={() => setAttempt((value) => value + 1)}>重新加载</Button><Button type="primary" icon={<IconDownload />} loading={downloading} onClick={() => void download()}>下载原文件</Button></div></div> : null}
      {!loading && !failed && type === 'PDF' && blob && url && <iframe className="knowledge-preview-pdf" src={url} title={document.name} onError={() => setFailed(true)} />}
      {!loading && !failed && type === 'XLSX' && <div className="knowledge-sheet-preview"><div className="knowledge-sheet-summary"><h1>{document.name}</h1><p>{source}</p></div><Tabs activeTab={sheet} onChange={setSheet}>{['商品库存', '仓库信息'].map((name) => <Tabs.TabPane key={name} title={`${name}（示例）`} />)}</Tabs><table><thead><tr>{(sheet === '商品库存' ? ['商品编码', '商品名称', '销售区域', '可用库存', '补货周期'] : ['仓库编码', '仓库名称', '区域', '联系人', '状态']).map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody>{(sheet === '商品库存' ? [['DEMO-1042', '便携收纳盒', '华东', '286', '3 天'], ['DEMO-1078', '桌面置物架', '华南', '94', '5 天'], ['DEMO-1126', '旅行收纳袋', '全国', '37', '按需']] : [['DEMO-021', '杭州中心仓', '华东', '周敏', '正常'], ['DEMO-035', '广州中心仓', '华南', '林溪', '正常']]).map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>}
      {!loading && !failed && type === 'MD' && <article className="knowledge-document-preview">{source === '' ? <p>文件内容为空</p> : markdown.map((line, index) => line.startsWith('# ') ? <h1 key={index}>{line.slice(2)}</h1> : line.startsWith('## ') ? <h2 key={index}>{line.slice(3)}</h2> : line.startsWith('### ') ? <h3 key={index}>{line.slice(4)}</h3> : line.startsWith('- ') ? <ul key={index}><li>{line.slice(2)}</li></ul> : <p key={index}>{line || '\u00a0'}</p>)}</article>}
      {!loading && !failed && type === 'TXT' && <pre className="knowledge-text-preview">{source === '' ? '文件内容为空' : source}</pre>}
      {!loading && !failed && (type === 'DOCX' || type === 'DOC' || (type === 'PDF' && !blob) || !['PDF', 'DOCX', 'DOC', 'XLSX', 'TXT', 'MD'].includes(type)) && <article className="knowledge-document-preview"><h1>{document.name}</h1><h2>内容概览</h2><p>{source}</p><h2>服务处理流程（示例）</h2><ol><li>确认客户的问题与期望结果，记录问题发生的时间。</li><li>根据服务规则核对订单、账户或商品信息。</li><li>向客户说明处理步骤及所需材料，避免重复索取已有信息。</li><li>完成处理后反馈结果；未解决的问题交由对应团队继续跟进。</li></ol><h2>资料核对（示例）</h2><table><thead><tr><th>核对项目</th><th>核对内容</th><th>处理要求</th></tr></thead><tbody><tr><td>问题描述</td><td>时间、操作步骤和异常现象</td><td>确保信息完整</td></tr><tr><td>业务凭证</td><td>订单编号或相关截图</td><td>仅收集必要资料</td></tr><tr><td>处理结果</td><td>解决方式与后续安排</td><td>向客户确认结果</td></tr></tbody></table><h2>回复参考（示例）</h2><p>您好，我们已收到您的问题。请提供相关业务编号及遇到的具体情况，我们会核对信息并协助处理。</p><h2>跟进与记录（示例）</h2><ul><li>记录客户诉求、核对结果和当前处理进展。</li><li>如需其他团队协助，交接已确认的信息与待解决的问题。</li><li>处理完成后确认客户是否仍需要帮助。</li></ul></article>}
    </main>
  </div>, window.document.body);
}
