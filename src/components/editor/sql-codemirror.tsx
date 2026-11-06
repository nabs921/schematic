'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { linter, lintGutter, Diagnostic } from '@codemirror/lint';
import { yCollab, ySyncAnnotation, yUndoManagerKeymap } from 'y-codemirror.next';
import type * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import { SqlParseError } from '@/lib/sql/parser';
import type { Collaborator } from '@/components/collaboration/collaborator-avatars';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Code2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Wand2,
  BookOpen,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { SCHEMA_TEMPLATES } from '@/lib/workspace/templates';

interface SqlCodeMirrorProps {
  initialValue: string;
  onChange: (value: string) => void;
  errors: SqlParseError[];
  tableCount: number;
  relationshipCount: number;
  readOnly?: boolean;
  isConnecting?: boolean;
  ytext?: Y.Text | null;
  awareness?: WebsocketProvider['awareness'] | null;
  onActivityChange?: (activity: string) => void;
  activeCollaborator?: Collaborator | null;
}

export function SqlCodeMirror({
  initialValue,
  onChange,
  errors,
  tableCount,
  relationshipCount,
  readOnly = false,
  isConnecting = false,
  ytext = null,
  awareness = null,
  onActivityChange,
  activeCollaborator,
}: SqlCodeMirrorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartment = useRef(new Compartment());

  const [showDiagnosticsDrawer, setShowDiagnosticsDrawer] = useState(false);
  const [copied, setCopied] = useState(false);

  // Keep a ref to latest errors and onChange so CM extensions don't stale
  const errorsRef = useRef(errors);
  const onChangeRef = useRef(onChange);
  const onActivityChangeRef = useRef(onActivityChange);

  useEffect(() => {
    errorsRef.current = errors;
  }, [errors]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onActivityChangeRef.current = onActivityChange;
  }, [onActivityChange]);

  // Jump to specific error line
  const handleJumpToError = (line: number) => {
    if (!viewRef.current) return;
    const view = viewRef.current;
    const lineNum = Math.min(Math.max(1, line), view.state.doc.lines);
    const lineObj = view.state.doc.line(lineNum);
    view.dispatch({
      selection: { anchor: lineObj.from, head: lineObj.to },
      scrollIntoView: true,
    });
    view.focus();
  };

  // SQL Formatter (formats keywords and indentation cleanly)
  const handleFormatSql = useCallback(() => {
    if (!viewRef.current || readOnly) return;
    const currentDoc = viewRef.current.state.doc.toString();

    // Uppercase SQL keywords and normalize statements
    const keywords = [
      'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
      'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'PRIMARY', 'KEY', 'FOREIGN',
      'REFERENCES', 'CONSTRAINT', 'DEFAULT', 'NOT', 'NULL', 'UNIQUE', 'CHECK',
      'CASCADE', 'RESTRICT', 'SERIAL', 'INT', 'INTEGER', 'BIGINT', 'VARCHAR',
      'TEXT', 'BOOLEAN', 'TIMESTAMP', 'WITH', 'TIME', 'ZONE', 'UUID', 'JSONB',
      'ON', 'AND', 'OR', 'INDEX', 'EXISTS', 'IF'
    ];

    let formatted = currentDoc;
    keywords.forEach((kw) => {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      formatted = formatted.replace(regex, kw);
    });

    viewRef.current.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: formatted },
    });
  }, [readOnly]);

  // Copy SQL
  const handleCopySql = () => {
    if (!viewRef.current) return;
    const text = viewRef.current.state.doc.toString();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Apply template
  const handleApplyTemplate = (templateKey: string) => {
    if (!viewRef.current || readOnly) return;
    const tmpl = SCHEMA_TEMPLATES.find((t) => t.key === templateKey);
    if (!tmpl) return;

    viewRef.current.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: tmpl.sql },
    });
  };

  // Initialize CodeMirror 6 with Yjs collaborative binding
  useEffect(() => {
    if (!editorRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    // Linter extension mapping our errors to CodeMirror diagnostics
    const sqlLinter = linter((view) => {
      const currentErrors = errorsRef.current;
      const diags: Diagnostic[] = [];

      for (const err of currentErrors) {
        const lineNum = Math.min(Math.max(1, err.line), view.state.doc.lines);
        const line = view.state.doc.line(lineNum);
        const from = Math.min(line.from + Math.max(0, err.column - 1), line.to);
        const to = Math.max(from + 1, line.to);

        diags.push({
          from,
          to,
          severity: 'error',
          message: err.message,
        });
      }

      return diags;
    });

    const updateListener = EditorView.updateListener.of((update) => {
      // Remote Yjs updates are replayed into CodeMirror with this annotation.
      // They still need to be saved to the database, but they must not make
      // the local user look like they are the one editing.
      const isRemoteSync = update.transactions.some(
        (tr) => tr.annotation(ySyncAnnotation) !== undefined
      );

      if (update.docChanged) {
        // Save on every change, including undo/redo and remote Yjs updates.
        // Undo/redo is replayed through Yjs, so trying to detect "local" edits
        // here caused those changes to never reach the database.
        onChangeRef.current(update.state.doc.toString());
      }

      if (!isRemoteSync && (update.selectionSet || update.docChanged)) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head).number;
        onActivityChangeRef.current?.(`Editing SQL (line ${line})`);
      }
    });

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      sql({ dialect: PostgreSQL }),
      oneDark,
      lintGutter(),
      sqlLinter,
      updateListener,
      EditorView.domEventHandlers({
        focus: () => {
          onActivityChangeRef.current?.('Editing SQL');
        },
      }),
      readOnlyCompartment.current.of([
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
      ]),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto' },
      }),
    ];

    // When Yjs collaborative text binding is active, Yjs owns the document
    // and undo history.
    if (ytext) {
      extensions.push(yCollab(ytext, awareness || null));
      extensions.push(keymap.of([...defaultKeymap, ...yUndoManagerKeymap, indentWithTab]));
    } else {
      extensions.push(history());
      extensions.push(keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]));
    }

    // When a Yjs text is bound, that text is the source of truth. Falling back
    // to `initialValue` here made the editor document differ from the (empty)
    // Y.Text, so the initial Yjs sync/seed was replayed on top of it and
    // produced duplicated SQL.
    const docContent = ytext ? ytext.toString() : initialValue;

    const state = EditorState.create({
      doc: docContent,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [ytext, awareness, readOnly, initialValue]);

  // Update read-only state if prop changes
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: readOnlyCompartment.current.reconfigure([
          EditorView.editable.of(!readOnly),
          EditorState.readOnly.of(readOnly),
        ]),
      });
    }
  }, [readOnly]);

  return (
    <div className="h-full w-full flex flex-col bg-[#090d16] border-r border-zinc-800 select-none">
      {/* Editor Header Toolbar */}
      <div className="h-10 border-b border-zinc-800/80 px-3 flex items-center justify-between bg-zinc-950/60 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            <Code2 className="h-3.5 w-3.5 text-indigo-400" />
            <span>PostgreSQL DDL</span>
          </div>

          {isConnecting ? (
            <span className="text-[10px] bg-zinc-900 text-zinc-400 border border-zinc-700/60 px-1.5 py-0.2 rounded font-medium">
              Connecting…
            </span>
          ) : (
            readOnly && (
              <span className="text-[10px] bg-amber-950/60 text-amber-300 border border-amber-800/50 px-1.5 py-0.2 rounded font-medium">
                Read-Only (Viewer)
              </span>
            )
          )}

          {activeCollaborator && activeCollaborator.activity?.includes('Editing SQL') && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px]">
              <span
                className="h-1.5 w-1.5 rounded-full animate-ping"
                style={{ backgroundColor: activeCollaborator.color }}
              />
              <span className="font-semibold text-zinc-200">{activeCollaborator.name}</span>
              <span className="text-indigo-300 font-mono text-[10px]">
                {activeCollaborator.activity.replace('Editing SQL', '').trim() || 'is editing'}
              </span>
            </div>
          )}
        </div>

        {/* Toolbar Action Buttons */}
        <div className="flex items-center gap-1">
          {!readOnly && (
            <>
              <Button
                onClick={handleFormatSql}
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 flex items-center gap-1"
                title="Format SQL"
              >
                <Wand2 className="h-3 w-3 text-indigo-400" />
                <span className="hidden sm:inline">Format</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 flex items-center gap-1"
                    title="Insert Starter Template"
                  >
                    <BookOpen className="h-3 w-3 text-cyan-400" />
                    <span className="hidden sm:inline">Templates</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {SCHEMA_TEMPLATES.map((tmpl) => (
                    <DropdownMenuItem
                      key={tmpl.key}
                      onClick={() => handleApplyTemplate(tmpl.key)}
                    >
                      <div>
                        <p className="font-semibold text-xs">{tmpl.name}</p>
                        <p className="text-[10px] text-zinc-400 line-clamp-1">{tmpl.description}</p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          <Button
            onClick={handleCopySql}
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            title="Copy SQL to Clipboard"
          >
            <Copy className="h-3 w-3 mr-1" />
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </Button>
        </div>
      </div>

      {/* Main CodeMirror Mount */}
      <div ref={editorRef} className="flex-1 overflow-hidden font-mono" />

      {/* Bottom Diagnostics & Stats Bar */}
      <div className="border-t border-zinc-800/80 bg-zinc-950/90 text-xs flex-shrink-0">
        <div className="px-3 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Status Pill */}
            {errors.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium text-[11px]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>SQL Valid</span>
              </span>
            ) : (
              <button
                onClick={() => setShowDiagnosticsDrawer(!showDiagnosticsDrawer)}
                className="inline-flex items-center gap-1.5 text-rose-400 hover:text-rose-300 font-medium text-[11px] bg-rose-950/40 px-2 py-0.5 rounded border border-rose-900/60 transition-colors"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{errors.length} Syntax {errors.length === 1 ? 'Error' : 'Errors'}</span>
                {showDiagnosticsDrawer ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                )}
              </button>
            )}

            <div className="h-3 w-px bg-zinc-800" />

            {/* Tables & Relations count */}
            <span className="text-zinc-400 text-[11px] font-mono">
              {tableCount} {tableCount === 1 ? 'table' : 'tables'} • {relationshipCount}{' '}
              {relationshipCount === 1 ? 'relation' : 'relations'}
            </span>
          </div>

          <span className="text-zinc-500 text-[10px] hidden sm:inline">
            Ctrl+S to save • Tab to indent
          </span>
        </div>

        {/* Diagnostics Drawer (when syntax errors exist) */}
        {showDiagnosticsDrawer && errors.length > 0 && (
          <div className="max-h-36 overflow-y-auto border-t border-zinc-800 bg-zinc-900/90 p-2 space-y-1">
            {errors.map((err, i) => (
              <button
                key={i}
                onClick={() => handleJumpToError(err.line)}
                className="w-full text-left p-1.5 rounded hover:bg-zinc-800/80 flex items-start gap-2 text-xs group transition-colors"
              >
                <span className="font-mono text-[10px] bg-red-950/80 text-red-300 border border-red-800/60 px-1 rounded flex-shrink-0 mt-0.5">
                  L{err.line}:{err.column}
                </span>
                <span className="text-zinc-300 group-hover:text-white line-clamp-2">
                  {err.message}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
