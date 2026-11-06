import { getCurrentUser } from '@/lib/auth/session';
import { redirect, notFound } from 'next/navigation';
import { getFileById, getCanvasNotes } from '@/lib/db/queries/files';
import { getFileComments } from '@/lib/db/queries/comments';
import { resolveFilePermission, getFileMembers } from '@/lib/db/queries/permissions';
import { getFolderBreadcrumbs } from '@/lib/db/queries/folders';
import { SchemaWorkspace } from '@/components/editor/schema-workspace';

export const dynamic = 'force-dynamic';

interface SchemaPageProps {
  params: Promise<{ id: string }>;
}

export default async function SchemaPage({ params }: SchemaPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const resolvedParams = await params;
  const fileId = resolvedParams.id;

  const file = await getFileById(fileId);
  if (!file) {
    notFound();
  }

  const permission = await resolveFilePermission(user.id, fileId);
  if (!permission.hasAccess || !permission.role) {
    redirect('/dashboard?error=access_denied');
  }

  const [members, breadcrumbs, canvasNotes, comments] = await Promise.all([
    getFileMembers(fileId),
    file.folder_id ? getFolderBreadcrumbs(file.folder_id) : Promise.resolve([]),
    getCanvasNotes(fileId),
    getFileComments(fileId),
  ]);

  const folderBreadcrumbs = breadcrumbs.map((f) => ({
    id: f.id,
    name: f.name,
  }));

  // Convert DB notes to canvas format
  const notes = canvasNotes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    color: note.color,
    position: { x: note.position_x, y: note.position_y },
  }));

  // Merge notes into canvas_data for the component
  const fileWithNotes = {
    ...file,
    canvas_data: {
      ...file.canvas_data,
      notes,
    },
  };

  return (
    <SchemaWorkspace
      user={user}
      file={fileWithNotes}
      role={permission.role}
      members={members}
      folderBreadcrumbs={folderBreadcrumbs}
      comments={comments}
    />
  );
}
