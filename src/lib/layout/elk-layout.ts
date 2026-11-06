import ELK, { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk.bundled.js';
import { ColumnDefinition, ParsedSchema } from '../sql/parser';
import { Node, Edge } from '@xyflow/react';

const elk = new ELK();

const TABLE_WIDTH = 280;
const HEADER_HEIGHT = 48;
const ROW_HEIGHT = 32;
const PADDING = 16;

export interface TableNodeData {
  name: string;
  fields: ColumnDefinition[];
  note?: string;
  [key: string]: unknown;
}

export interface NoteNodeData {
  title: string;
  content: string;
  color: string;
  width?: number;
  height?: number;
  onUpdate?: (id: string, updates: Partial<{ title: string; content: string; color: string }>) => void;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
  [key: string]: unknown;
}

export function calculateTableHeight(columnCount: number): number {
  return HEADER_HEIGHT + columnCount * ROW_HEIGHT + PADDING;
}

export async function layoutSchema(
  schema: ParsedSchema,
  existingPositions?: Record<string, { x: number; y: number }>,
  direction: 'RIGHT' | 'DOWN' = 'RIGHT'
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const children: ElkNode[] = [];
  const elkEdges: ElkExtendedEdge[] = [];

  for (const table of schema.tables) {
    const height = calculateTableHeight(table.fields.length);
    children.push({
      id: table.name,
      width: TABLE_WIDTH,
      height,
    });
  }

  for (const rel of schema.relationships) {
    // Only add edge to ELK if both source and target tables exist
    const hasSource = schema.tables.some((t) => t.name === rel.sourceTable);
    const hasTarget = schema.tables.some((t) => t.name === rel.targetTable);

    if (hasSource && hasTarget) {
      elkEdges.push({
        id: rel.id,
        sources: [rel.sourceTable],
        targets: [rel.targetTable],
      });
    }
  }

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.spacing.nodeNode': '70',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.spacing.edgeEdge': '30',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
    },
    children,
    edges: elkEdges,
  };

  const layoutedGraph = await elk.layout(elkGraph);

  const nodes: Node[] = (layoutedGraph.children || []).map((node) => {
    const table = schema.tables.find((t) => t.name === node.id)!;
    const manualPos = existingPositions?.[node.id];

    return {
      id: node.id,
      type: 'tableNode',
      position: manualPos || { x: node.x || 0, y: node.y || 0 },
      data: {
        name: table.name,
        fields: table.fields,
        note: table.note,
      },
    };
  });

  const edges: Edge[] = schema.relationships.map((rel) => {
    return {
      id: rel.id,
      source: rel.sourceTable,
      sourceHandle: `${rel.sourceTable}-${rel.sourceColumn}-source`,
      target: rel.targetTable,
      targetHandle: `${rel.targetTable}-${rel.targetColumn}-target`,
      type: 'smoothstep',
      animated: false,
      label: rel.cardinality,
      labelStyle: { fill: '#94a3b8', fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: '#0f172a', fillOpacity: 0.85 },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
      style: {
        stroke: '#64748b',
        strokeWidth: 2,
      },
      data: {
        sourceColumn: rel.sourceColumn,
        targetColumn: rel.targetColumn,
        cardinality: rel.cardinality,
      },
    };
  });

  return { nodes, edges };
}
