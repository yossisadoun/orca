import { FileText, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { listDocs, subscribeWorkspaceFsChanged, writeDoc, type ProjectDoc } from "../orcaPlanHost";
import styles from "./ProjectDocs.module.css";

const DEFAULT_DOCS: { filename: string; title: string; seed: string }[] = [
  {
    filename: "vision.md",
    title: "Vision",
    seed: `# Vision

<!-- This document is the source of truth for what the project IS.
     Claude agents read this file to understand scope and intent.
     Update it as the vision evolves — keep it current, not aspirational.

     Cover:
     - What the product does (one paragraph)
     - Who it's for
     - Core user flow (the "happy path")
     - What makes it different / why it matters
     - Monetization or business model (if relevant)
     - What it is NOT (explicit non-goals help agents stay focused)
-->
`,
  },
  {
    filename: "architecture.md",
    title: "Architecture",
    seed: `# Architecture

<!-- This document is the source of truth for HOW the project is built.
     Claude agents read this file before making technical decisions.
     Update it when the stack or key patterns change.

     Cover:
     - Tech stack (languages, frameworks, major libraries)
     - Project structure (key directories and what lives where)
     - Data model (main entities and relationships)
     - Key architectural decisions and why they were made
     - External services / APIs / infrastructure
     - Development setup (how to run locally)
     - Conventions (naming, patterns, testing approach)
-->
`,
  },
];

function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.md$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}


export function ProjectDocs({ workspaceRoot }: { workspaceRoot: string }) {
  const [docs, setDocs] = useState<ProjectDoc[]>([]);
  const [editingFilename, setEditingFilename] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const allFilenames = DEFAULT_DOCS.map((d) => d.filename);

  // Load docs from disk, seed defaults if missing, reload on file changes
  useEffect(() => {
    if (!workspaceRoot) return;
    let cancelled = false;
    const refresh = () => void listDocs(workspaceRoot).then((loaded) => {
      if (cancelled) return;
      setDocs(loaded);
    });

    // Seed missing docs on first load
    void listDocs(workspaceRoot).then(async (loaded) => {
      if (cancelled) return;
      setDocs(loaded);
      const existingFilenames = new Set(loaded.map((d) => d.filename));
      const missing = DEFAULT_DOCS.filter((d) => !existingFilenames.has(d.filename));
      if (missing.length > 0) {
        for (const doc of missing) {
          await writeDoc(workspaceRoot, doc.filename, doc.seed, allFilenames);
        }
        if (!cancelled) refresh();
      }
    });

    const unsub = subscribeWorkspaceFsChanged(() => refresh());
    return () => { cancelled = true; unsub?.(); };
  }, [workspaceRoot, allFilenames]);

  const openEditor = useCallback(
    (filename: string) => {
      const existing = docs.find((d) => d.filename === filename);
      setEditContent(existing?.content ?? "");
      setEditingFilename(filename);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [docs],
  );

  const saveAndClose = useCallback(() => {
    if (!editingFilename || !workspaceRoot) return;
    void writeDoc(workspaceRoot, editingFilename, editContent, allFilenames).then(() => {
      // Update local state
      setDocs((prev) => {
        const exists = prev.some((d) => d.filename === editingFilename);
        if (exists) {
          return prev.map((d) => (d.filename === editingFilename ? { ...d, content: editContent } : d));
        }
        return [...prev, { filename: editingFilename, content: editContent }];
      });
      setEditingFilename(null);
    });
  }, [editingFilename, editContent, workspaceRoot, allFilenames]);

  return (
    <div className={styles.root}>
      <h3 className={styles.heading}>Artifacts</h3>
      <div className={styles.cards}>
        {DEFAULT_DOCS.map(({ filename, title }) => {
          const doc = docs.find((d) => d.filename === filename);
          const isEmpty = !doc?.content?.trim();
          const isEditing = editingFilename === filename;

          return (
            <button
              key={filename}
              type="button"
              className={`${styles.card} ${isEditing ? styles.cardActive : ""}`}
              onClick={() => openEditor(filename)}
              title={isEmpty ? `${title} — empty` : `${title} — click to edit`}
            >
              <FileText size={13} strokeWidth={2} className={styles.cardIcon} />
              <span className={styles.cardTitle}>{title}</span>
              {!isEmpty ? <span className={styles.cardDot} /> : null}
            </button>
          );
        })}
      </div>
      {editingFilename ? (
        <div className={styles.editor}>
          <div className={styles.editorHeader}>
            <span className={styles.editorTitle}>
              {titleFromFilename(editingFilename)}
            </span>
            <span className={styles.editorFilename}>.orca-plan/docs/{editingFilename}</span>
            <button
              type="button"
              className={styles.editorCloseBtn}
              onClick={saveAndClose}
              title="Save and close"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
          <textarea
            ref={textareaRef}
            className={styles.editorTextarea}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                saveAndClose();
              }
            }}
            placeholder={`Write about the project's ${titleFromFilename(editingFilename).toLowerCase()} here...\n\nThis file lives on disk at .orca-plan/docs/${editingFilename} — Claude can read and update it too.`}
            spellCheck={false}
          />
        </div>
      ) : null}
    </div>
  );
}
