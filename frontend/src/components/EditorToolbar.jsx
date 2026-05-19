import {
  Bold, Italic, Strikethrough,
  Heading2, Heading3,
  List, ListOrdered, Quote,
  Code, Link2, Unlink,
  Minus, Undo2, Redo2,
} from "lucide-react";

function ToolButton({ active, disabled, onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-indigo-100 text-indigo-700"
          : disabled
          ? "text-gray-300"
          : "text-gray-600 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5" />;
}

export default function EditorToolbar({ editor }) {
  if (!editor) return null;

  const setLink = () => {
    const previous = editor.getAttributes("link").href;
    const url = window.prompt("URL", previous || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 px-2 py-1.5 bg-gray-50 sticky top-0 z-10">
      <ToolButton
        title="Bold (⌘B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={14} />
      </ToolButton>

      <ToolButton
        title="Italic (⌘I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={14} />
      </ToolButton>

      <ToolButton
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={14} />
      </ToolButton>

      <Divider />

      <ToolButton
        title="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={14} />
      </ToolButton>

      <ToolButton
        title="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 size={14} />
      </ToolButton>

      <Divider />

      <ToolButton
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={14} />
      </ToolButton>

      <ToolButton
        title="Ordered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={14} />
      </ToolButton>

      <ToolButton
        title="Blockquote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={14} />
      </ToolButton>

      <Divider />

      <ToolButton
        title="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={14} />
      </ToolButton>

      <ToolButton
        title="Link (⌘K)"
        active={editor.isActive("link")}
        onClick={setLink}
      >
        <Link2 size={14} />
      </ToolButton>

      {editor.isActive("link") && (
        <ToolButton
          title="Remove link"
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink size={14} />
        </ToolButton>
      )}

      <ToolButton
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus size={14} />
      </ToolButton>

      <Divider />

      <ToolButton
        title="Undo (⌘Z)"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 size={14} />
      </ToolButton>

      <ToolButton
        title="Redo (⌘⇧Z)"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 size={14} />
      </ToolButton>
    </div>
  );
}
