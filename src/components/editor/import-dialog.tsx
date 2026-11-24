'use client';

import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Upload, FileUp } from 'lucide-react';
import { importDbmlToSql } from '@/lib/sql/exporters';
import { type SqlDialect, detectSqlDialect, SUPPORTED_DIALECTS, DIALECT_OPTIONS } from '@/lib/sql/dialects';

type ImportFormat = 'sql' | 'dbml' | 'json';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (sql: string, dialect?: SqlDialect) => void;
  currentDialect?: SqlDialect;
}

export function ImportDialog({
  open,
  onOpenChange,
  onImport,
  currentDialect = 'postgres',
}: ImportDialogProps) {
  const [format, setFormat] = useState<ImportFormat>('sql');
  const [selectedDialect, setSelectedDialect] = useState<SqlDialect | 'auto'>('auto');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setContent('');
    setError(null);
    setSelectedDialect('auto');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setIsReadingFile(true);
    try {
      const text = await file.text();
      setContent(text);
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'dbml') {
        setFormat('dbml');
      } else if (extension === 'json') {
        setFormat('json');
      } else {
        setFormat('sql');
        const detected = detectSqlDialect(text);
        setSelectedDialect(detected);
      }
    } catch {
      setError('Could not read that file.');
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = content.trim();
    if (!trimmed) {
      setError('Paste a schema or choose a file first.');
      return;
    }

    try {
      let sql = trimmed;
      let finalDialect: SqlDialect =
        selectedDialect === 'auto' ? detectSqlDialect(trimmed) : selectedDialect;

      if (format === 'dbml') {
        finalDialect = currentDialect;
        sql = importDbmlToSql(trimmed, finalDialect);
      } else if (format === 'json') {
        const parsed = JSON.parse(trimmed) as { sql?: unknown; dialect?: unknown };
        if (typeof parsed.sql !== 'string' || !parsed.sql.trim()) {
          throw new Error('JSON files must contain a "sql" string.');
        }
        sql = parsed.sql;
        if (typeof parsed.dialect === 'string' && parsed.dialect in SUPPORTED_DIALECTS) {
          finalDialect = parsed.dialect as SqlDialect;
        } else {
          finalDialect = detectSqlDialect(sql);
        }
      }

      onImport(sql, finalDialect);
      toast.success(
        `Schema imported (${SUPPORTED_DIALECTS[finalDialect]?.name || 'SQL'})`
      );
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import this schema.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-indigo-400" />
            Import Schema
          </DialogTitle>
          <DialogDescription>
            Import SQL (PostgreSQL, MySQL, SQLite, SQL Server, Oracle), DBML, or a Schematic JSON export.
            The imported schema replaces the current editor content for everyone in this room.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5">
              {(['sql', 'dbml', 'json'] as ImportFormat[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormat(option)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    format === option
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {option === 'sql' ? 'SQL DDL' : option.toUpperCase()}
                </button>
              ))}
            </div>

            {format === 'sql' && (
              <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedDialect('auto')}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    selectedDialect === 'auto'
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Auto-Detect
                </button>
                {DIALECT_OPTIONS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDialect(d.id)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      selectedDialect === d.id
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {d.badgeLabel}
                  </button>
                ))}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".sql,.dbml,.json,text/plain,application/json"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-zinc-800 bg-zinc-900/60 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={isReadingFile}
            >
              {isReadingFile ? (
                <Spinner className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <FileUp className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isReadingFile ? 'Reading...' : 'Choose file'}
            </Button>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              format === 'dbml'
                ? 'Table users {\n  id uuid [pk]\n  email varchar(255) [unique, not null]\n}'
                : format === 'json'
                  ? '{ "sql": "CREATE TABLE ..." }'
                  : 'CREATE TABLE users (\n  id UUID PRIMARY KEY\n);'
            }
            spellCheck={false}
            className="h-64 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 font-mono text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-700"
          />

          {error && (
            <div className="rounded-lg border border-red-800/80 bg-red-950/50 p-2.5 text-xs text-red-300">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!content.trim() || isReadingFile}>
              Import Schema
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
