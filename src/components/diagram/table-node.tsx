'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Key, Link as LinkIcon, Database, MessageSquare } from 'lucide-react';
import { useComments } from '@/components/comments/comments-context';

export interface ColumnItem {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  isNullable: boolean;
  defaultValue?: string;
  references?: {
    table: string;
    column: string;
  };
}

export interface TableNodeProps {
  id: string;
  data: {
    name: string;
    fields: ColumnItem[];
    note?: string;
  };
}

const TYPE_BADGE_BASE =
  'inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none';

/**
 * Colour-code PostgreSQL data types so the diagram is readable at a glance.
 * Families share a colour: UUID, numeric, text, boolean, date/time, JSON and
 * binary types each get their own hue; anything unrecognised stays neutral.
 */
function typeBadgeClass(type: string): string {
  const normalized = type
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[\]$/g, '')
    .trim();

  if (['uuid', 'uniqueidentifier'].includes(normalized)) {
    return `${TYPE_BADGE_BASE} border-violet-500/40 bg-violet-500/10 text-violet-300`;
  }

  if (
    [
      'int',
      'integer',
      'int2',
      'int4',
      'int8',
      'smallint',
      'bigint',
      'serial',
      'bigserial',
      'smallserial',
      'numeric',
      'decimal',
      'real',
      'float',
      'float4',
      'float8',
      'double',
      'money',
    ].includes(normalized) ||
    normalized.startsWith('numeric') ||
    normalized.startsWith('decimal')
  ) {
    return `${TYPE_BADGE_BASE} border-amber-500/40 bg-amber-500/10 text-amber-300`;
  }

  if (
    [
      'varchar',
      'character varying',
      'char',
      'character',
      'text',
      'tinytext',
      'mediumtext',
      'longtext',
      'citext',
      'name',
      'string',
    ].includes(normalized)
  ) {
    return `${TYPE_BADGE_BASE} border-emerald-500/40 bg-emerald-500/10 text-emerald-300`;
  }

  if (['bool', 'boolean'].includes(normalized)) {
    return `${TYPE_BADGE_BASE} border-rose-500/40 bg-rose-500/10 text-rose-300`;
  }

  if (
    [
      'date',
      'time',
      'timetz',
      'timestamp',
      'timestamptz',
      'interval',
      'datetime',
    ].includes(normalized) ||
    normalized.startsWith('timestamp') ||
    normalized.startsWith('time')
  ) {
    return `${TYPE_BADGE_BASE} border-cyan-500/40 bg-cyan-500/10 text-cyan-300`;
  }

  if (['json', 'jsonb'].includes(normalized)) {
    return `${TYPE_BADGE_BASE} border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300`;
  }

  if (['bytea', 'binary', 'varbinary', 'blob'].includes(normalized)) {
    return `${TYPE_BADGE_BASE} border-orange-500/40 bg-orange-500/10 text-orange-300`;
  }

  return `${TYPE_BADGE_BASE} border-zinc-600/60 bg-zinc-800/80 text-zinc-400`;
}

export const TableNode = memo(({ data }: TableNodeProps) => {
  const { name, fields = [], note } = data;
  const { openComments, tableCommentCount } = useComments();
  const tableComments = tableCommentCount(name);

  return (
    <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/95 shadow-2xl min-w-[280px] max-w-[340px] text-zinc-100 overflow-hidden font-sans backdrop-blur-md select-none transition-shadow hover:border-zinc-600">
      {/* Table Header */}
      <div className="px-3.5 py-2.5 bg-zinc-800 border-b border-zinc-700/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="h-5 w-5 rounded-md bg-zinc-700 text-zinc-300 flex items-center justify-center flex-shrink-0">
            <Database className="h-3 w-3" />
          </div>
          <span className="font-bold text-xs tracking-tight text-white font-mono truncate" title={name}>
            {name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openComments({ table: name });
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="nodrag nopan flex items-center gap-1 rounded-md px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
            title={tableComments > 0 ? `${tableComments} open table comment(s)` : 'Table comments'}
          >
            <MessageSquare className="h-3 w-3" />
            {tableComments > 0 && (
              <span className="rounded-full bg-indigo-500 px-1 py-0.5 text-[9px] font-bold leading-none text-white">
                {tableComments}
              </span>
            )}
          </button>
          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-mono font-medium border border-zinc-700/60">
            {fields.length} cols
          </span>
        </div>
      </div>

      {note && (
        <div className="px-3 py-1 bg-zinc-800/40 border-b border-zinc-800 text-[10px] text-zinc-500 italic">
          {note}
        </div>
      )}

      {/* Columns List */}
      <div className="divide-y divide-zinc-800/60 text-xs py-1">
        {fields.map((field) => (
          <div
            key={field.name}
            className="relative px-3 py-1.5 flex items-center justify-between gap-3 hover:bg-zinc-800/50 group transition-colors"
          >
            {/* Invisible target handle used only as an edge anchor */}
            <Handle
              type="target"
              position={Position.Left}
              id={`${name}-${field.name}-target`}
              style={{ width: 8, height: 8, background: 'transparent', border: 'none', opacity: 0 }}
            />

            {/* Left: Key Badges & Column Name */}
            <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
              {field.isPrimaryKey ? (
                <span
                  title="Primary Key"
                  className="inline-flex items-center gap-0.5 text-[9px] font-bold text-zinc-300 bg-zinc-700 border border-zinc-600 px-1 py-0.2 rounded"
                >
                  <Key className="h-2.5 w-2.5" /> PK
                </span>
              ) : field.isForeignKey ? (
                <span
                  title={`Foreign Key -> ${field.references?.table}.${field.references?.column}`}
                  className="inline-flex items-center gap-0.5 text-[9px] font-bold text-zinc-300 bg-zinc-700 border border-zinc-600 px-1 py-0.2 rounded"
                >
                  <LinkIcon className="h-2.5 w-2.5" /> FK
                </span>
              ) : field.isUnique ? (
                <span
                  title="Unique"
                  className="inline-flex items-center text-[9px] font-bold text-zinc-300 bg-zinc-700 border border-zinc-600 px-1 py-0.2 rounded"
                >
                  UQ
                </span>
              ) : (
                <span className="w-3" />
              )}

              <span
                className={`truncate font-mono text-xs ${
                  field.isPrimaryKey
                    ? 'font-bold text-zinc-100'
                    : field.isForeignKey
                    ? 'font-medium text-zinc-200'
                    : 'text-zinc-300'
                }`}
                title={field.name}
              >
                {field.name}
              </span>
            </div>

            {/* Right: Data Type & Nullability */}
            <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px] font-mono">
              <span
                className={typeBadgeClass(field.type)}
                title={`${field.type} data type`}
              >
                {field.type}
              </span>

              {field.isNullable && (
                <span className="text-[9px] text-zinc-600 font-sans" title="Nullable">
                  ?
                </span>
              )}
            </div>

            {/* Invisible source handle used only as an edge anchor */}
            <Handle
              type="source"
              position={Position.Right}
              id={`${name}-${field.name}-source`}
              style={{ width: 8, height: 8, background: 'transparent', border: 'none', opacity: 0 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

TableNode.displayName = 'TableNode';
