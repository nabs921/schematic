'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  BackgroundVariant,
  useReactFlow,
  useStore,
  ReactFlowProvider,
  ViewportPortal,
  type OnNodeDrag,
} from '@xyflow/react';
import { TableNode } from './table-node';
import { NoteNode } from './note-node';
import { ParsedSchema } from '@/lib/sql/parser';
import { layoutSchema } from '@/lib/layout/elk-layout';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Maximize2,
  StickyNote,
  Download,
  AlertTriangle,
  Map as MapIcon,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import type { CollaboratorUser } from '@/components/collaboration/types';

export interface CanvasNote {
  id: string;
  title: string;
  content: string;
  color: string;
  position: { x: number; y: number };
}

interface ErCanvasProps {
  schema: ParsedSchema | null;
  isInvalidSql: boolean;
  errorCount: number;
  initialPositions?: Record<string, { x: number; y: number }>;
  notes: CanvasNote[];
  onNotesChange?: (notes: CanvasNote[]) => void;
  onPositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
  readOnly?: boolean;
  schemaName?: string;
  others?: readonly CollaboratorUser[];
  onActivityChange?: (activity: string) => void;
  onCursorMove?: (cursor: { x: number; y: number } | null) => void;
}

const nodeTypes = {
  tableNode: TableNode,
  noteNode: NoteNode,
};

// Stable identity so an omitted prop doesn't retrigger the layout effect.
const EMPTY_POSITIONS: Record<string, { x: number; y: number }> = {};

function ErCanvasInternal({
  schema,
  isInvalidSql,
  errorCount,
  initialPositions = EMPTY_POSITIONS,
  notes,
  onNotesChange,
  onPositionsChange,
  readOnly = false,
  schemaName = 'schema',
  others = [],
  onActivityChange,
  onCursorMove,
}: ErCanvasProps) {
  const { fitView, screenToFlowPosition } = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);
  // Keep remote cursors a constant on-screen size regardless of canvas zoom.
  const cursorScale = zoom > 0 && Number.isFinite(zoom) ? 1 / zoom : 1;
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  const cursorRafRef = useRef<number | null>(null);
  const cursorLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [nodes, setNodes, onNodesChangeHandler] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeHandler] = useEdgesState<Edge>([]);
  const [showMinimap, setShowMinimap] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Keep track of the last valid schema without mutating a ref during render.
  const lastValidSchemaRef = useRef<ParsedSchema | null>(schema);
  useEffect(() => {
    if (schema && schema.tables.length > 0) {
      lastValidSchemaRef.current = schema;
    }
  }, [schema]);

  // Handle Note actions
  const handleUpdateNote = useCallback(
    (id: string, updates: Partial<CanvasNote>) => {
      if (readOnly || !onNotesChange) return;
      const updatedNotes = notes.map((n) => (n.id === id ? { ...n, ...updates } : n));
      onNotesChange(updatedNotes);
      onActivityChange?.('Editing note');
    },
    [notes, onNotesChange, readOnly, onActivityChange]
  );

  const handleDeleteNote = useCallback(
    (id: string) => {
      if (readOnly || !onNotesChange) return;
      const updatedNotes = notes.filter((n) => n.id !== id);
      onNotesChange(updatedNotes);
      onActivityChange?.('Deleted note');
    },
    [notes, onNotesChange, readOnly, onActivityChange]
  );

  const handleAddNote = useCallback(() => {
    if (readOnly || !onNotesChange) return;
    const newNote: CanvasNote = {
      id: crypto.randomUUID(),
      title: 'Note',
      content: '',
      color: 'yellow',
      position: { x: 100, y: 100 },
    };
    onNotesChange([...notes, newNote]);
    onActivityChange?.('Added note');
  }, [notes, onNotesChange, readOnly, onActivityChange]);

  // Layout runner
  const runLayout = useCallback(
    async (schemaToUse: ParsedSchema, manualPositions?: Record<string, { x: number; y: number }>) => {
      if (!schemaToUse) return;

      const { nodes: tableNodes, edges: relEdges } = await layoutSchema(
        schemaToUse,
        manualPositions
      );

      // Create note nodes
      const noteNodes: Node[] = notes.map((note) => ({
        id: note.id,
        type: 'noteNode',
        position: note.position,
        data: {
          title: note.title,
          content: note.content,
          color: note.color,
          readOnly,
          onUpdate: handleUpdateNote,
          onDelete: handleDeleteNote,
        },
      }));

      setNodes([...tableNodes, ...noteNodes]);
      setEdges(relEdges);
    },
    [notes, readOnly, handleUpdateNote, handleDeleteNote, setNodes, setEdges]
  );

  // Update layout when schema or any collaborator's positions change
  useEffect(() => {
    const activeSchema = schema || lastValidSchemaRef.current;
    if (activeSchema) {
      runLayout(activeSchema, initialPositions);
    }
  }, [schema, runLayout, initialPositions]);

  // Node drags are editor-only. Viewers can pan/zoom and inspect the canvas,
  // but must not change table or note positions.
  const handleNodeDrag = useCallback<OnNodeDrag>(
    (_event, node) => {
      if (readOnly) return;
      const data = node.data as { name?: string; label?: string };
      const label = data?.name || data?.label || node.id;
      onActivityChange?.(`Moving "${label}"`);
    },
    [onActivityChange, readOnly]
  );

  // Sync node drags to the collaborative positions map.
  const handleNodeDragStop = useCallback<OnNodeDrag>(
    (_event, node) => {
      if (readOnly) return;

      if (node.type === 'noteNode') {
        if (onNotesChange) {
          const updatedNotes = notes.map((n) =>
            n.id === node.id ? { ...n, position: node.position } : n
          );
          onNotesChange(updatedNotes);
        }
      } else {
        // Send the full map so the parent can diff it against its last known
        // positions and only write the key that actually changed.
        onPositionsChange?.({
          ...initialPositions,
          [node.id]: node.position,
        });
      }
      onActivityChange?.('Viewing schema');
    },
    [initialPositions, notes, onNotesChange, onPositionsChange, onActivityChange, readOnly]
  );

  // Send at most one cursor update per animation frame, but always include the
  // latest pointer position so the final movement is never dropped.
  const flushCursor = useCallback(() => {
    cursorRafRef.current = null;
    const clientPosition = pendingCursorRef.current;
    pendingCursorRef.current = null;
    if (!clientPosition || !onCursorMove) return;

    // Store cursor coordinates in flow space so collaborators with a
    // different pan/zoom/panel size still see the cursor in the right place.
    const position = screenToFlowPosition(clientPosition);
    onCursorMove({
      x: Math.round(position.x),
      y: Math.round(position.y),
    });
  }, [onCursorMove, screenToFlowPosition]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onCursorMove) return;

      if (cursorLeaveTimerRef.current) {
        clearTimeout(cursorLeaveTimerRef.current);
        cursorLeaveTimerRef.current = null;
      }

      pendingCursorRef.current = { x: e.clientX, y: e.clientY };
      if (cursorRafRef.current === null) {
        cursorRafRef.current = requestAnimationFrame(flushCursor);
      }
    },
    [flushCursor, onCursorMove]
  );

  const handlePointerEnter = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (cursorLeaveTimerRef.current) {
        clearTimeout(cursorLeaveTimerRef.current);
        cursorLeaveTimerRef.current = null;
      }
      if (!onCursorMove) return;

      // Resend immediately so the cursor reappears as soon as the pointer
      // re-enters the canvas, without waiting for the next movement.
      pendingCursorRef.current = { x: e.clientX, y: e.clientY };
      if (cursorRafRef.current === null) {
        cursorRafRef.current = requestAnimationFrame(flushCursor);
      }
    },
    [flushCursor, onCursorMove]
  );

  const handlePointerLeave = useCallback(() => {
    // Small grace period avoids flicker when the pointer crosses a child
    // element or briefly leaves/re-enters the canvas.
    if (cursorLeaveTimerRef.current) clearTimeout(cursorLeaveTimerRef.current);
    cursorLeaveTimerRef.current = setTimeout(() => {
      cursorLeaveTimerRef.current = null;
      pendingCursorRef.current = null;
      onCursorMove?.(null);
    }, 2000);
  }, [onCursorMove]);

  useEffect(() => {
    return () => {
      if (cursorRafRef.current !== null) cancelAnimationFrame(cursorRafRef.current);
      if (cursorLeaveTimerRef.current) clearTimeout(cursorLeaveTimerRef.current);
    };
  }, []);

  // Explicit Auto Layout Button (resets positions via ELK)
  const handleAutoLayout = useCallback(async () => {
    const activeSchema = schema || lastValidSchemaRef.current;
    if (!activeSchema) return;

    onPositionsChange?.({});

    const { nodes: tableNodes, edges: relEdges } = await layoutSchema(activeSchema, undefined);

    const noteNodes: Node[] = notes.map((note) => ({
      id: note.id,
      type: 'noteNode',
      position: note.position,
      data: {
        title: note.title,
        content: note.content,
        color: note.color,
        readOnly,
        onUpdate: handleUpdateNote,
        onDelete: handleDeleteNote,
      },
    }));

    setNodes([...tableNodes, ...noteNodes]);
    setEdges(relEdges);

    setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 });
    }, 50);
  }, [schema, notes, readOnly, handleUpdateNote, handleDeleteNote, onPositionsChange, setNodes, setEdges, fitView]);

  // Export PNG
  const handleExportPng = useCallback(async () => {
    if (!reactFlowWrapper.current) return;
    setIsExporting(true);
    try {
      // Find react flow viewport
      const flowElement = reactFlowWrapper.current.querySelector('.react-flow__viewport') as HTMLElement;
      if (!flowElement) return;

      const dataUrl = await toPng(flowElement, {
        backgroundColor: '#070b14',
        quality: 1,
        pixelRatio: 2,
      });

      const a = document.createElement('a');
      a.setAttribute('download', `${schemaName.replace(/\s+/g, '_').toLowerCase()}-diagram.png`);
      a.setAttribute('href', dataUrl);
      a.click();
    } catch (err) {
      console.error('Export PNG failed:', err);
      toast.error('Failed to export diagram as PNG');
    } finally {
      setIsExporting(false);
    }
  }, [schemaName]);

  return (
    <div
      ref={reactFlowWrapper}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="w-full h-full relative bg-[#070b14]"
    >
      {/* Floating Canvas Action Toolbar */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-zinc-900/90 border border-zinc-800 backdrop-blur-md rounded-xl p-1.5 shadow-2xl shadow-black/80">
        {!readOnly && (
          <Button
            onClick={handleAutoLayout}
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-1.5"
            title="Auto arrange tables with ELK.js"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>Auto Layout</span>
          </Button>
        )}

        {!readOnly && (
          <Button
            onClick={handleAddNote}
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-1.5"
            title="Add sticky canvas note"
          >
            <StickyNote className="h-3.5 w-3.5 text-amber-400" />
            <span>Add Note</span>
          </Button>
        )}

        <div className="h-4 w-px bg-zinc-800" />

        <Button
          onClick={() => fitView({ padding: 0.2, duration: 300 })}
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800"
          title="Fit to view"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>

        <Button
          onClick={() => setShowMinimap(!showMinimap)}
          size="icon"
          variant="ghost"
          className={`h-7 w-7 ${
            showMinimap ? 'text-indigo-400 bg-indigo-950/40' : 'text-zinc-400 hover:text-white'
          }`}
          title="Toggle minimap"
        >
          <MapIcon className="h-3.5 w-3.5" />
        </Button>

        <Button
          onClick={handleExportPng}
          size="icon"
          variant="ghost"
          disabled={isExporting}
          className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800"
          title="Export diagram as PNG"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Temporary Invalid SQL Fallback Indicator */}
      {isInvalidSql && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 bg-amber-950/80 border border-amber-800/80 rounded-lg text-amber-200 text-xs shadow-lg backdrop-blur-md animate-fade-in">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <span>Showing last valid diagram • {errorCount} syntax error in SQL</span>
        </div>
      )}

      {/* Main Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeHandler}
        onEdgesChange={onEdgesChangeHandler}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        nodesFocusable={!readOnly}
        elementsSelectable
        minZoom={0.15}
        maxZoom={2.5}
        defaultViewport={{ x: 50, y: 50, zoom: 0.85 }}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        {/* Remote collaborator cursors live in the flow coordinate system, so
            they stay aligned while each user pans, zooms, or resizes panels. */}
        <ViewportPortal>
          {others?.map((other) => {
            const cursor = other.presence?.cursor;
            if (!cursor) return null;
            const info = other.info || {};
            const presence = other.presence || {};
            const name = info.name || presence.name || 'Collaborator';
            const color = info.color || presence.color || '#6366f1';

            return (
              <div
                key={other.clientId}
                className="pointer-events-none absolute top-0 left-0 z-[9999] select-none transition-transform duration-75 ease-out"
                style={{
                  transformOrigin: 'top left',
                  transform: `translate(${cursor.x}px, ${cursor.y}px) scale(${cursorScale})`,
                }}
              >
                <svg
                  className="h-5 w-5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                  viewBox="0 0 24 24"
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                >
                  <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36z" />
                </svg>
                <div
                  className="ml-3 -mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white shadow-lg whitespace-nowrap flex items-center gap-1"
                  style={{ backgroundColor: color }}
                >
                  <span>{name}</span>
                </div>
              </div>
            );
          })}
        </ViewportPortal>

        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#1e293b" />
        <Controls position="bottom-right" showInteractive={false} />
        {showMinimap && (
          <MiniMap
            position="bottom-left"
            zoomable
            pannable
            nodeColor={(n) => {
              if (n.type === 'noteNode') return '#eab308';
              return '#6366f1';
            }}
            maskColor="rgba(7, 11, 20, 0.7)"
          />
        )}
      </ReactFlow>
    </div>
  );
}

export function ErCanvas(props: ErCanvasProps) {
  return (
    <ReactFlowProvider>
      <ErCanvasInternal {...props} />
    </ReactFlowProvider>
  );
}
