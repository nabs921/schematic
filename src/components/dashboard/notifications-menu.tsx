'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Bell, Database, Folder as FolderIcon } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ShareNotification } from '@/lib/db/queries/notifications';
import {
  getNotificationsAction,
  markNotificationsSeenAction,
} from '@/lib/workspace/actions';

const POLL_INTERVAL_MS = 30_000;

function notificationKey(notification: ShareNotification): string {
  return `${notification.resourceType}:${notification.id}`;
}

function isUnread(notification: ShareNotification, seenAt: string): boolean {
  return new Date(notification.createdAt).getTime() > new Date(seenAt).getTime();
}

interface NotificationsMenuProps {
  initialNotifications: ShareNotification[];
  initialSeenAt: string;
}

export function NotificationsMenu({
  initialNotifications,
  initialSeenAt,
}: NotificationsMenuProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [seenAt, setSeenAt] = useState(initialSeenAt);
  const [isOpen, setIsOpen] = useState(false);
  const [openedUnreadKeys, setOpenedUnreadKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [locallyReadKeys, setLocallyReadKeys] = useState<Set<string>>(
    () => new Set()
  );

  // The feed rendered by the server is the baseline, so anything new that a
  // later poll discovers is a genuinely new invite.
  const knownKeysRef = useRef(new Set(initialNotifications.map(notificationKey)));
  const refreshingRef = useRef(false);
  const markingSeenRef = useRef(false);
  const isOpenRef = useRef(false);

  const unreadCount = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          isUnread(notification, seenAt) &&
          !locallyReadKeys.has(notificationKey(notification))
      ).length,
    [notifications, seenAt, locallyReadKeys]
  );

  const highlightedCount = useMemo(
    () =>
      notifications.filter((notification) =>
        openedUnreadKeys.has(notificationKey(notification))
      ).length,
    [notifications, openedUnreadKeys]
  );

  const badgeCount = isOpen && highlightedCount > 0 ? highlightedCount : unreadCount;

  const markSeen = useCallback(async () => {
    if (markingSeenRef.current) return;
    markingSeenRef.current = true;

    try {
      const result = await markNotificationsSeenAction();
      if (result?.seenAt) {
        setSeenAt((previous) =>
          new Date(previous).getTime() < new Date(result.seenAt).getTime()
            ? result.seenAt
            : previous
        );
      }
    } catch {
      // The local read keys already clear the badge; the next successful
      // update will persist the state.
    } finally {
      markingSeenRef.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;

    try {
      const feed = await getNotificationsAction();
      const fresh = feed.notifications.filter(
        (notification) => !knownKeysRef.current.has(notificationKey(notification))
      );

      if (fresh.length === 1) {
        const [notification] = fresh;
        toast.info(
          `${notification.inviterName} shared "${notification.resourceName}" with you`
        );
      } else if (fresh.length > 1) {
        toast.info(`${fresh.length} new invites received`);
      }

      // If the menu is already open, keep the new items highlighted and mark
      // them read as well.
      const freshUnread = fresh.filter((notification) =>
        isUnread(notification, feed.seenAt)
      );
      if (isOpenRef.current && freshUnread.length > 0) {
        const freshKeys = freshUnread.map(notificationKey);
        setOpenedUnreadKeys((previous) => {
          const next = new Set(previous);
          freshKeys.forEach((key) => next.add(key));
          return next;
        });
        setLocallyReadKeys((previous) => {
          const next = new Set(previous);
          freshKeys.forEach((key) => next.add(key));
          return next;
        });
        void markSeen();
      }

      knownKeysRef.current = new Set(feed.notifications.map(notificationKey));
      setNotifications(feed.notifications);
      setSeenAt((previous) =>
        new Date(previous).getTime() < new Date(feed.seenAt).getTime()
          ? feed.seenAt
          : previous
      );
    } catch {
      // Ignore transient polling errors and retry on the next interval/focus.
    } finally {
      refreshingRef.current = false;
    }
  }, [markSeen]);

  useEffect(() => {
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const handleFocus = () => void refresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refresh]);

  const handleOpenChange = (open: boolean) => {
    isOpenRef.current = open;
    setIsOpen(open);

    if (open) {
      // Snapshot the currently unread items so their dots remain visible for
      // this open session, then persist the read state.
      const unreadKeys = notifications
        .filter(
          (notification) =>
            isUnread(notification, seenAt) &&
            !locallyReadKeys.has(notificationKey(notification))
        )
        .map(notificationKey);
      setOpenedUnreadKeys(new Set(unreadKeys));
      if (unreadKeys.length > 0) {
        setLocallyReadKeys((previous) => {
          const next = new Set(previous);
          unreadKeys.forEach((key) => next.add(key));
          return next;
        });
        void markSeen();
      }
    } else {
      setOpenedUnreadKeys(new Set());
    }
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Notifications"
          aria-label={
            badgeCount > 0
              ? `Notifications (${badgeCount} unread)`
              : 'Notifications'
          }
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <Bell className="h-4 w-4" />
          {badgeCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-xs font-semibold text-zinc-100">
              Notifications
            </span>
            {badgeCount > 0 && (
              <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                {badgeCount} new
              </span>
            )}
          </div>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-1">
          {notifications.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell className="mx-auto h-6 w-6 text-zinc-700" />
              <p className="mt-2 text-xs font-medium text-zinc-300">
                No notifications
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                When someone shares a schema or folder with you, it will show up
                here.
              </p>
            </div>
          ) : (
            notifications.map((notification) => {
              const href =
                notification.resourceType === 'folder'
                  ? `/dashboard?folder=${notification.resourceId}`
                  : `/schema/${notification.resourceId}`;
              const isNew =
                isOpen &&
                openedUnreadKeys.has(notificationKey(notification));

              return (
                <DropdownMenuItem
                  key={notificationKey(notification)}
                  asChild
                  className="p-0 focus:bg-zinc-800"
                >
                  <Link
                    href={href}
                    className="flex w-full items-start gap-2.5 rounded-sm px-2.5 py-2.5"
                  >
                    <div
                      className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase text-white"
                      style={{
                        backgroundColor: notification.inviterAvatarColor,
                      }}
                    >
                      {notification.inviterName.charAt(0)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-relaxed text-zinc-300">
                        <span className="font-semibold text-zinc-100">
                          {notification.inviterName}
                        </span>{' '}
                        shared{' '}
                        <span className="font-semibold text-zinc-100">
                          {notification.resourceName}
                        </span>{' '}
                        with you
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-500">
                        {notification.resourceType === 'folder' ? (
                          <FolderIcon className="h-3 w-3 flex-shrink-0" />
                        ) : (
                          <Database className="h-3 w-3 flex-shrink-0" />
                        )}
                        <span>
                          {notification.resourceType === 'folder'
                            ? 'Folder'
                            : 'Schema'}
                        </span>
                        <span>·</span>
                        <span className="capitalize">{notification.role}</span>
                        <span>·</span>
                        <span>{formatRelativeDate(notification.createdAt)}</span>
                      </div>
                    </div>

                    {isNew && (
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-500" />
                    )}
                  </Link>
                </DropdownMenuItem>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
