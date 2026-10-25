import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Heading2, Italic, List, ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Note } from '@/types/note'

type NoteEditorProps = {
  content: Note['content']
  onChange: (content: Note['content']) => void
}

export function NoteEditor({ content, onChange }: NoteEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2] } })],
    content,
    editorProps: {
      attributes: {
        class: 'note-editor min-h-64 p-4 leading-relaxed outline-none',
        role: 'textbox',
        'aria-label': 'Note content',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  })

  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold') ?? false,
      italic: editor?.isActive('italic') ?? false,
      heading: editor?.isActive('heading', { level: 2 }) ?? false,
      bulletList: editor?.isActive('bulletList') ?? false,
      orderedList: editor?.isActive('orderedList') ?? false,
    }),
  })

  if (!editor) return null

  const actions = [
    { label: 'Bold', icon: Bold, active: active?.bold, run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Italic', icon: Italic, active: active?.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Heading', icon: Heading2, active: active?.heading, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: 'Bullet list', icon: List, active: active?.bulletList, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: 'Numbered list', icon: ListOrdered, active: active?.orderedList, run: () => editor.chain().focus().toggleOrderedList().run() },
  ]

  return (
    <div className="mt-6">
      <div role="group" aria-label="Text formatting" className="mb-2 flex flex-wrap gap-1 pb-2">
        {actions.map(({ label, icon: Icon, active, run }) => (
          <Button
            key={label}
            type="button"
            variant={active ? 'secondary' : 'ghost'}
            size="icon"
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={run}
          >
            <Icon aria-hidden="true" />
          </Button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
