import { getCurrentUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getUserFolders, getFolderBreadcrumbs } from '@/lib/db/queries/folders';
import { getFolderFiles } from '@/lib/db/queries/files';
import { resolveFolderPermission } from '@/lib/db/queries/permissions';
import { getNotificationFeed } from '@/lib/db/queries/notifications';
import { DashboardView } from '@/components/dashboard/dashboard-view';

export const dynamic = 'force-dynamic';

interface DashboardPageProps {
  searchParams: Promise<{ folder?: string; error?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const resolvedSearchParams = await searchParams;
  const currentFolderId = resolvedSearchParams.folder || null;
  const accessDenied = resolvedSearchParams.error === 'access_denied';

  const currentFolderPermission = currentFolderId
    ? await resolveFolderPermission(user.id, currentFolderId)
    : null;

  if (currentFolderId && !currentFolderPermission?.hasAccess) {
    redirect('/dashboard');
  }

  // Root is always writable for the signed-in user. Inside a shared folder,
  // only owners/editors may create folders, schemas, or use templates.
  const canCreateHere =
    currentFolderId === null || Boolean(currentFolderPermission?.canEdit);

  const [folders, files, breadcrumbFolders, notificationFeed] = await Promise.all([
    getUserFolders(user.id),
    getFolderFiles(currentFolderId, user.id),
    getFolderBreadcrumbs(currentFolderId),
    getNotificationFeed(user.id),
  ]);

  const breadcrumbs = breadcrumbFolders.map((f) => ({
    id: f.id,
    name: f.name,
  }));

  return (
    <DashboardView
      user={user}
      folders={folders}
      files={files}
      currentFolderId={currentFolderId}
      canCreateHere={canCreateHere}
      breadcrumbs={breadcrumbs}
      notifications={notificationFeed.notifications}
      notificationsSeenAt={notificationFeed.seenAt}
      accessDenied={accessDenied}
    />
  );
}
