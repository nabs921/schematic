'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { Trash2, Palette, StickyNote } from 'lucide-react';

const NOTE_COLORS: Record<string, { bg: string; border: string; text: string; header: string }> = {
  yellow: {
    bg: 'bg-amber-950/80',
    border: 'border-amber-700/80',
    text: 'text-amber-100',
    header: 'bg-amber-900/60',
  },
  blue: {
    bg: 'bg-sky-950/80',
    border: 'border-sky-700/80',
    text: 'text-sky-100',
    header: 'bg-sky-900/60',
  },
  green: {
    bg: 'bg-emerald-950/80',
    border: 'border-emerald-700/80',
    text: 'text-emerald-100',
    header: 'bg-emerald-900/60',
  },
  purple: {
    bg: 'bg-purple-950/80',
    border: 'border-purple-700/80',
    text: 'text-purple-100',
    header: 'bg-purple-900/60',
  },
  rose: {
    bg: 'bg-rose-950/80',
    border: 'border-rose-700/80',
    text: 'text-rose-100',
    header: 'bg-rose-900/60',
  },
};

export interface NoteNodeProps {
  id: string;
  data: {
    title: string;
    content: string;
    color: string;
    onUpdate?: (id: string, updates: { title?: string; content?: string; color?: string }) => void;
    onDelete?: (id: string) => void;
    readOnly?: boolean;
  };
}

export const NoteNode = memo(({ id, data }: NoteNodeProps) => {
  const { title = 'Note', content = '', color = 'yellow', onUpdate, onDelete, readOnly = false } = data;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentContent, setCurrentContent] = useState(content);
  const [isContentFocused, setIsContentFocused] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Notes are collaborative, so edits are pushed while typing instead of only
  // on blur. A short debounce keeps Yjs/DB writes and canvas relayouts cheap
  // while still feeling live to other collaborators.
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const pendingUpdateRef = useRef<{ title?: string; content?: string }>({});
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingUpdate = () => {
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }

    const pending = pendingUpdateRef.current;
    pendingUpdateRef.current = {};
    if (onUpdateRef.current && Object.keys(pending).length > 0) {
      onUpdateRef.current(id, pending);
    }
  };

  const queueUpdate = (updates: { title?: string; content?: string }) => {
    if (readOnly) return;
    pendingUpdateRef.current = { ...pendingUpdateRef.current, ...updates };

    if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    updateTimerRef.current = setTimeout(flushPendingUpdate, 200);
  };

  useEffect(() => {
    return () => {
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    };
  }, []);

  const styleTheme = NOTE_COLORS[color] || NOTE_COLORS.yellow;

  // Notes are collaborative: when another user edits the title/content, sync
  // the incoming value into local state. Skip while this user is actively
  // editing so their in-progress input isn't overwritten.
  useEffect(() => {
    if (!isEditingTitle) {
      setCurrentTitle(title);
    }
  }, [title, isEditingTitle]);

  useEffect(() => {
    if (!isContentFocused) {
      setCurrentContent(content);
    }
  }, [content, isContentFocused]);

  // Use the collaborative prop directly when this user isn't editing, so a
  // remote change is visible immediately (no intermediate local-state frame).
  const displayTitle = isEditingTitle ? currentTitle : title;
  const displayContent = isContentFocused ? currentContent : content;

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    flushPendingUpdate();
    if (onUpdate && currentTitle !== title) {
      onUpdate(id, { title: currentTitle });
    }
  };

  const handleContentBlur = () => {
    setIsContentFocused(false);
    flushPendingUpdate();
    if (onUpdate && currentContent !== content) {
      onUpdate(id, { content: currentContent });
    }
  };

  const handleColorSelect = (newColor: string) => {
    setShowColorPicker(false);
    flushPendingUpdate();
    if (onUpdate) {
      onUpdate(id, { color: newColor });
    }
  };

  return (
    <div
      className={`rounded-xl border ${styleTheme.border} ${styleTheme.bg} shadow-xl w-60 overflow-hidden font-sans backdrop-blur-md transition-shadow hover:shadow-2xl`}
    >
      {/* Note Header */}
      <div
        className={`px-3 py-2 ${styleTheme.header} border-b ${styleTheme.border} flex items-center justify-between`}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-2">
          <StickyNote className="h-3.5 w-3.5 opacity-70 flex-shrink-0" />
          {isEditingTitle && !readOnly ? (
            <input
              type="text"
              value={currentTitle}
              onChange={(e) => {
                setCurrentTitle(e.target.value);
                queueUpdate({ title: e.target.value });
              }}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleBlur()}
              autoFocus
              className="bg-black/30 border border-white/20 rounded px-1.5 py-0.5 text-xs text-white w-full outline-none"
            />
          ) : (
            <span
              onClick={() => !readOnly && setIsEditingTitle(true)}
              className={`text-xs font-semibold truncate ${!readOnly ? 'cursor-pointer hover:underline' : ''}`}
            >
              {displayTitle || 'Note'}
            </span>
          )}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1 relative">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="p-1 rounded hover:bg-black/20 text-white/70 hover:text-white"
              title="Change color"
            >
              <Palette className="h-3 w-3" />
            </button>

            {showColorPicker && (
              <div className="absolute top-6 right-0 bg-zinc-900 border border-zinc-700 rounded-lg p-1.5 shadow-xl flex gap-1 z-30">
                {Object.keys(NOTE_COLORS).map((cKey) => (
                  <button
                    key={cKey}
                    onClick={() => handleColorSelect(cKey)}
                    className="w-4 h-4 rounded-full border border-white/30 hover:scale-110 transition-transform"
                    style={{
                      backgroundColor:
                        cKey === 'yellow'
                          ? '#eab308'
                          : cKey === 'blue'
                          ? '#38bdf8'
                          : cKey === 'green'
                          ? '#34d399'
                          : cKey === 'purple'
                          ? '#c084fc'
                          : '#fb7185',
                    }}
                  />
                ))}
              </div>
            )}

            <button
              onClick={() => onDelete && onDelete(id)}
              className="p-1 rounded hover:bg-black/20 text-red-400 hover:text-red-300"
              title="Delete note"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Note Body */}
      <div className="p-3">
        {readOnly ? (
          <p className="text-xs whitespace-pre-wrap opacity-90">{displayContent || 'No content'}</p>
        ) : (
          <textarea
            value={displayContent}
            onChange={(e) => {
              setCurrentContent(e.target.value);
              queueUpdate({ content: e.target.value });
            }}
            onFocus={() => setIsContentFocused(true)}
            onBlur={handleContentBlur}
            placeholder="Add schema notes, todos, or documentation..."
            rows={4}
            className="w-full bg-transparent resize-none outline-none text-xs text-white/90 placeholder:text-white/40 leading-relaxed font-sans"
          />
        )}
      </div>
    </div>
  );
});

NoteNode.displayName = 'NoteNode';
