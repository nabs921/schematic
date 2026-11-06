'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Share2, UserPlus, Trash2, Users, Mail, Pencil, Eye } from 'lucide-react';
import type { MemberInfo } from '@/lib/db/queries/permissions';
import {
  getShareMembersAction,
  removeFileMemberAction,
  removeFolderMemberAction,
  shareFileAction,
  shareFolderAction,
} from '@/lib/workspace/actions';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: 'file' | 'folder';
  resourceId: string;
  resourceName: string;
  members?: MemberInfo[];
  canManage: boolean;
}

export function ShareDialog({
  open,
  onOpenChange,
  resourceType,
  resourceId,
  resourceName,
  members,
  canManage,
}: ShareDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [memberList, setMemberList] = useState<MemberInfo[]>(members ?? []);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  const resourceLabel = resourceType === 'file' ? 'Schema' : 'Folder';

  const loadMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    try {
      const list = await getShareMembersAction(resourceType, resourceId);
      setMemberList(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setIsLoadingMembers(false);
    }
  }, [resourceType, resourceId]);

  useEffect(() => {
    // The workspace already passes the members it rendered on the server; the
    // dashboard opens this dialog without them and fetches on demand.
    if (!open || members) return;
    const timer = window.setTimeout(() => void loadMembers(), 0);
    return () => window.clearTimeout(timer);
  }, [open, members, loadMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res =
        resourceType === 'file'
          ? await shareFileAction(resourceId, email.trim(), role)
          : await shareFolderAction(resourceId, email.trim(), role);

      setFeedback({
        message: res.message,
        isError: !res.success,
      });

      if (res.success) {
        toast.success(res.message);
        setEmail('');
        await loadMembers();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to share ${resourceType}`;
      setFeedback({ message, isError: true });
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      if (resourceType === 'file') {
        await removeFileMemberAction(resourceId, userId);
      } else {
        await removeFolderMemberAction(resourceId, userId);
      }
      toast.success('Member removed');
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-indigo-400" />
            Share {resourceLabel.toLowerCase()} &ldquo;{resourceName}&rdquo;
          </DialogTitle>
          <DialogDescription>
            Collaborate in real time with your team. Folder permissions are inherited by every
            nested folder and schema.
          </DialogDescription>
        </DialogHeader>

        {/* Invite Form */}
        {canManage && (
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-8 text-xs bg-zinc-950/60 border-zinc-800"
                />
              </div>

              <Select
                value={role}
                onValueChange={(value) => setRole(value as 'editor' | 'viewer')}
              >
                <SelectTrigger
                  aria-label="Member role"
                  className="h-9 w-[124px] text-xs"
                >
                  <span className="flex items-center gap-1.5">
                    {role === 'editor' ? (
                      <Pencil className="h-3.5 w-3.5 text-indigo-400" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 text-zinc-400" />
                    )}
                    <span>{role === 'editor' ? 'Editor' : 'Viewer'}</span>
                  </span>
                </SelectTrigger>
                <SelectContent align="end" className="w-[200px]">
                  <SelectItem value="editor" className="py-2">
                    <Pencil className="h-3.5 w-3.5 flex-shrink-0 text-indigo-400" />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium text-zinc-100">Editor</span>
                      <span className="text-[10px] text-zinc-500">
                        Can edit the schema and comment
                      </span>
                    </span>
                  </SelectItem>
                  <SelectItem value="viewer" className="py-2">
                    <Eye className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium text-zinc-100">Viewer</span>
                      <span className="text-[10px] text-zinc-500">
                        Read-only access to the schema
                      </span>
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="submit"
                disabled={isSubmitting || !email.trim()}
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-500 text-xs h-9 px-3 flex items-center gap-1.5"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Invite</span>
              </Button>
            </div>

            {feedback && (
              <div
                className={`p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
                  feedback.isError
                    ? 'bg-red-950/60 border-red-800 text-red-300'
                    : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    feedback.isError ? 'bg-red-400' : 'bg-emerald-400'
                  }`}
                />
                {feedback.message}
              </div>
            )}
          </form>
        )}

        {/* Members List */}
        <div className="space-y-2 mt-2">
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-zinc-400" />
            Members with access ({memberList.length})
          </h4>

          <div className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/40 max-h-56 overflow-y-auto">
            {isLoadingMembers && memberList.length === 0 ? (
              <div className="p-3 text-xs text-zinc-500">Loading members...</div>
            ) : memberList.length === 0 ? (
              <div className="p-3 text-xs text-zinc-500">No members yet.</div>
            ) : (
              memberList.map((member) => (
                <div
                  key={member.user_id}
                  className="p-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase flex-shrink-0"
                      style={{ backgroundColor: member.avatar_color }}
                    >
                      {member.name.charAt(0)}
                    </div>
                    <div className="overflow-hidden">
                      <p className="font-medium text-zinc-200 truncate">{member.name}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge
                      variant={member.role === 'owner' ? 'default' : 'secondary'}
                      className="text-[10px] uppercase font-semibold"
                    >
                      {member.role}
                    </Badge>

                    {member.inherited_from && (
                      <span
                        title={`Inherited from folder: ${member.inherited_from}`}
                        className="text-[10px] text-zinc-500 italic"
                      >
                        (inherited)
                      </span>
                    )}

                    {canManage && member.role !== 'owner' && !member.inherited_from && (
                      <button
                        onClick={() => void handleRemoveMember(member.user_id)}
                        className="text-zinc-500 hover:text-red-400 p-1 rounded"
                        title="Remove access"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
