import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Message } from './ui';

interface Props { value: string; onChange: (html: string, text: string) => void; }

const AnswerImage = Node.create({
  name: 'image', group: 'block', atom: true,
  addAttributes() { return { src: { default: null }, alt: { default: '' } }; },
  parseHTML() { return [{ tag: 'img[src]' }]; },
  renderHTML({ HTMLAttributes }) { return ['img', HTMLAttributes]; },
});

export function RichTextEditor({ value, onChange }: Props) {
  const editor = useEditor({
    extensions: [StarterKit, AnswerImage],
    content: value,
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML(), instance.getText()),
    editorProps: { attributes: { class: 'tiptap-editor', 'aria-label': '流程内容编辑器' } },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;
  const insertImage = (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) { Message.error('仅支持 JPG、JPEG、PNG 格式'); return; }
    if (file.size > 5 * 1024 * 1024) { Message.error('单张图片不能超过 5MB'); return; }
    if ((editor.getHTML().match(/<img\b/gi) || []).length >= 5) { Message.error('每条问答最多添加 5 张图片'); return; }
    const reader = new FileReader();
    reader.onload = () => editor.chain().focus().insertContent({ type: 'image', attrs: { src: String(reader.result), alt: file.name } }).run();
    reader.readAsDataURL(file);
  };
  return <div>
    <div className="editor-toolbar" role="toolbar" aria-label="富文本格式工具栏">
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} aria-label="一级标题">H1</button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="二级标题">H2</button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} aria-label="三级标题">H3</button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="有序列表">1.</button>
      <button type="button" onClick={() => editor.chain().focus().undo().run()} aria-label="撤销">↶</button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()} aria-label="重做">↷</button>
      <button type="button" onClick={() => document.getElementById('rich-text-image-upload')?.click()} aria-label="插入图片">图片</button>
      <input id="rich-text-image-upload" type="file" accept="image/jpeg,image/png" hidden onChange={(event) => { insertImage(event.target.files?.[0]); event.currentTarget.value = ''; }} />
    </div>
    <EditorContent editor={editor} />
  </div>;
}
