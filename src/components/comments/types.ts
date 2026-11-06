export interface CommentTarget {
  table: string;
  column?: string;
}

export interface FileComment {
  id: string;
  fileId: string;
  userId: string;
  parentId: string | null;
  target: string;
  body: string;
  resolved: boolean;
  createdAt: string;
  authorName: string;
  authorColor: string;
}

export interface CommentThread {
  id: string;
  target: string;
  resolved: boolean;
  comments: FileComment[];
}

/**
 * Stable key stored on comments. Table-level and column-level threads use
 * different keys so they can be queried independently.
 */
export function commentTargetKey(target: CommentTarget): string {
  return target.column ? `${target.table}::${target.column}` : target.table;
}
