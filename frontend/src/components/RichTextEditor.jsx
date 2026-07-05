import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'

function ToolbarBtn({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      className={`tiptap-btn${active ? ' active' : ''}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

export default function RichTextEditor({ onChange, placeholder = 'Write your message...', minHeight = 200, editorRef }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: { style: `min-height:${minHeight}px` },
    },
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  })

  // Expose imperative API via editorRef
  useEffect(() => {
    if (!editorRef) return
    editorRef.current = {
      setContent: (html) => editor?.commands.setContent(html),
      getHTML: () => editor?.getHTML() ?? '',
      isEmpty: () => editor?.isEmpty ?? true,
    }
  }, [editor, editorRef])

  if (!editor) return null

  const setLink = () => {
    const prev = editor.getAttributes('link').href
    const url = window.prompt('URL', prev || 'https://')
    if (url === null) return
    if (url === '') { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url }).run()
  }

  return (
    <div className="tiptap-wrapper">
      <div className="tiptap-toolbar">
        <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <b>B</b>
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <i>I</i>
        </ToolbarBtn>
        <div className="tiptap-divider" />
        <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <circle cx="1.5" cy="3" r="1.5"/><rect x="4" y="2" width="10" height="2" rx="1"/>
            <circle cx="1.5" cy="7" r="1.5"/><rect x="4" y="6" width="10" height="2" rx="1"/>
            <circle cx="1.5" cy="11" r="1.5"/><rect x="4" y="10" width="10" height="2" rx="1"/>
          </svg>
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <text x="0" y="5" fontSize="5" fontWeight="700">1.</text>
            <rect x="5" y="2" width="9" height="2" rx="1"/>
            <text x="0" y="9" fontSize="5" fontWeight="700">2.</text>
            <rect x="5" y="6" width="9" height="2" rx="1"/>
            <text x="0" y="13" fontSize="5" fontWeight="700">3.</text>
            <rect x="5" y="10" width="9" height="2" rx="1"/>
          </svg>
        </ToolbarBtn>
        <div className="tiptap-divider" />
        <ToolbarBtn active={editor.isActive('link')} onClick={setLink} title="Insert link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        </ToolbarBtn>
      </div>
      <EditorContent editor={editor} className="tiptap-content" />
    </div>
  )
}
