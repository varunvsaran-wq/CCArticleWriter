import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useEffect, useImperativeHandle, forwardRef, useRef, useState } from "react";
import EditorToolbar from "./EditorToolbar";
import { markdownToHtml, htmlToMarkdown } from "../utils/markdown";

// Decorate [N] citation markers in the editor surface (visual only — text stays plain)
const CITE_INLINE = /\[(\d+)\]/g;

const CitationDecoration = Extension.create({
  name: "citationDecoration",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decos = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText) return;
              const text = node.text || "";
              CITE_INLINE.lastIndex = 0;
              let m;
              while ((m = CITE_INLINE.exec(text)) !== null) {
                const from = pos + m.index;
                decos.push(
                  Decoration.inline(from, from + m[0].length, {
                    class: "citation-marker",
                    "data-ref": m[1],
                  })
                );
              }
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

const RichTextEditor = forwardRef(function RichTextEditor(
  {
    initialMarkdown,
    onDirtyChange,
    onMarkdownChange,
    onSelectionChange,
    placeholder = "Start writing…",
    readOnly = false,
  },
  ref
) {
  // Tracks markdown the parent has already seen, so re-syncing external content
  // doesn't loop back as a user edit.
  const lastSyncedRef = useRef(initialMarkdown ?? "");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: "bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto" } },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-indigo-600 underline" },
      }),
      Placeholder.configure({ placeholder }),
      CitationDecoration,
    ],
    content: markdownToHtml(initialMarkdown ?? ""),
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: "article-content prose-tight focus:outline-none p-6 sm:p-8 min-h-[400px]",
      },
    },
    onUpdate: ({ editor }) => {
      onDirtyChange?.(true);
      if (onMarkdownChange) {
        const md = htmlToMarkdown(editor.getHTML());
        lastSyncedRef.current = md;
        onMarkdownChange(md);
      }
    },
    onSelectionUpdate: ({ editor }) => {
      if (!onSelectionChange) return;
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        onSelectionChange(null);
        return;
      }
      const text = editor.state.doc.textBetween(from, to, "\n", " ");
      onSelectionChange({ from, to, text });
    },
  });

  // External markdown changes (version restore, applied revision) flow back in here.
  // Avoid clobbering the user's cursor on their own edits by comparing against lastSyncedRef.
  useEffect(() => {
    if (!editor) return;
    const incoming = initialMarkdown ?? "";
    if (incoming.trim() === lastSyncedRef.current.trim()) return;
    lastSyncedRef.current = incoming;
    editor.commands.setContent(markdownToHtml(incoming), false);
    onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMarkdown, editor]);

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => (editor ? htmlToMarkdown(editor.getHTML()) : ""),
      isEmpty: () => editor?.isEmpty ?? true,
      focus: () => editor?.commands.focus(),
      getSelection: () => {
        if (!editor) return null;
        const { from, to, empty } = editor.state.selection;
        if (empty) return null;
        const text = editor.state.doc.textBetween(from, to, "\n", " ");
        return { from, to, text };
      },
      getContextAround: (from, to, chars = 400) => {
        if (!editor) return { before: "", after: "" };
        const docSize = editor.state.doc.content.size;
        const beforeFrom = Math.max(0, from - chars);
        const afterTo = Math.min(docSize, to + chars);
        return {
          before: editor.state.doc.textBetween(beforeFrom, from, "\n", " "),
          after: editor.state.doc.textBetween(to, afterTo, "\n", " "),
        };
      },
      replaceRange: (from, to, text) => {
        if (!editor) return;
        editor
          .chain()
          .focus()
          .insertContentAt({ from, to }, text, {
            parseOptions: { preserveWhitespace: "full" },
          })
          .run();
      },
    }),
    [editor]
  );

  return (
    <div className="flex flex-col">
      {!readOnly && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
});

export default RichTextEditor;
