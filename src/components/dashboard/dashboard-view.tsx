"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SafeUser } from "@/lib/db/queries/users";
import { FolderWithDetails } from "@/lib/db/queries/folders";
import { FileWithDetails } from "@/lib/db/queries/files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Database,
  Folder as FolderIcon,
  FolderPlus,
  FilePlus2,
  Search,
  MoreVertical,
  ChevronRight,
  LayoutGrid,
  List,
  Trash2,
  Edit2,
  FolderInput,
  Copy,
  Share2,
  ExternalLink,
  LogOut,
  Layers,
  ArrowRight,
  Eye,
  ShieldAlert,
} from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";
import { SCHEMA_TEMPLATES } from "@/lib/workspace/templates";
import { ShareDialog } from "@/components/collaboration/share-dialog";
import { NotificationsMenu } from "@/components/dashboard/notifications-menu";
import type { ShareNotification } from "@/lib/db/queries/notifications";
import {
  createFileAction,
  renameFileAction,
  moveFileAction,
  duplicateFileAction,
  deleteFileAction,
  createFolderAction,
  renameFolderAction,
  moveFolderAction,
  deleteFolderAction,
} from "@/lib/workspace/actions";
import { logout } from "@/lib/auth/actions";

interface DashboardViewProps {
  user: SafeUser;
  folders: FolderWithDetails[];
  files: FileWithDetails[];
  currentFolderId: string | null;
  canCreateHere: boolean;
  breadcrumbs: { id: string; name: string }[];
  notifications: ShareNotification[];
  notificationsSeenAt: string;
  accessDenied?: boolean;
}

export function DashboardView({
  user,
  folders,
  files,
  currentFolderId,
  canCreateHere,
  breadcrumbs,
  notifications,
  notificationsSeenAt,
  accessDenied = false,
}: DashboardViewProps) {
  const router = useRouter();

  const getErrorMessage = (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback;

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Modal states
  const [isNewFileOpen, setIsNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("ecommerce");

  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [renameTarget, setRenameTarget] = useState<{
    type: "file" | "folder";
    id: string;
    name: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [moveTarget, setMoveTarget] = useState<{
    type: "file" | "folder";
    id: string;
    name: string;
  } | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{
    type: "file" | "folder";
    id: string;
    name: string;
  } | null>(null);

  const [shareTarget, setShareTarget] = useState<{
    type: "file" | "folder";
    id: string;
    name: string;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtered files & folders
  const folderIds = new Set(folders.map((folder) => folder.id));
  const isRootFolder = (folder: FolderWithDetails) =>
    folder.parent_id === null || !folderIds.has(folder.parent_id);

  const currentSubfolders = folders.filter((f) =>
    currentFolderId ? f.parent_id === currentFolderId : isRootFolder(f),
  );

  const filteredFolders = currentSubfolders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Handlers
  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("name", newFileName);
      if (currentFolderId) formData.set("folderId", currentFolderId);
      formData.set("templateKey", selectedTemplate);

      const res = await createFileAction(formData);
      setIsNewFileOpen(false);
      setNewFileName("");
      router.push(`/schema/${res.fileId}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create schema"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("name", newFolderName);
      if (currentFolderId) formData.set("parentId", currentFolderId);

      await createFolderAction(formData);
      setIsNewFolderOpen(false);
      setNewFolderName("");
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create folder"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    setIsSubmitting(true);
    try {
      if (renameTarget.type === "file") {
        await renameFileAction(renameTarget.id, renameValue);
      } else {
        await renameFolderAction(renameTarget.id, renameValue);
      }
      setRenameTarget(null);
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Rename failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveTarget) return;
    setIsSubmitting(true);
    try {
      if (moveTarget.type === "file") {
        await moveFileAction(moveTarget.id, targetFolderId);
      } else {
        await moveFolderAction(moveTarget.id, targetFolderId);
      }
      setMoveTarget(null);
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Move failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    try {
      if (deleteTarget.type === "file") {
        await deleteFileAction(deleteTarget.id);
      } else {
        await deleteFolderAction(deleteTarget.id);
      }
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Delete failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicate = async (fileId: string) => {
    try {
      const res = await duplicateFileAction(fileId);
      router.push(`/schema/${res.fileId}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Duplicate failed"));
    }
  };

  const shareCanManage = shareTarget
    ? shareTarget.type === "file"
      ? ["owner", "editor"].includes(files.find((file) => file.id === shareTarget.id)?.role ?? "")
      : ["owner", "editor"].includes(
          folders.find((folder) => folder.id === shareTarget.id)?.role ?? "",
        )
    : false;

  return (
    <div className="h-screen w-screen flex bg-[#0a0a0a] text-zinc-100 overflow-hidden font-sans">
      {/* Sidebar Folder Navigation */}
      <aside className="w-64 border-r border-zinc-800/80 bg-[#0a0a0a]/90 flex flex-col flex-shrink-0 select-none">
        {/* App Brand */}
        <div className="h-16 border-b border-zinc-800/80 px-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Database className="h-4 w-4 text-zinc-300" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white block leading-none">
                Schematic
              </span>
            </div>
          </Link>
        </div>

        {/* User Workspace Info */}
        <div className="p-3 border-b border-zinc-800/60">
          <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/50">
            <div className="flex items-center gap-2 overflow-hidden">
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase flex-shrink-0"
                style={{ backgroundColor: user.avatar_color }}
              >
                {user.name.charAt(0)}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-medium text-zinc-200 truncate">{user.name}</p>
                <p className="text-[10px] text-zinc-500 truncate">{user.email}</p>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-zinc-500 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800">
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs">Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logout()}
                  className="text-red-400 focus:text-red-300"
                >
                  <LogOut className="h-3.5 w-3.5 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Folder Tree */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="flex items-center justify-between px-2 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            <span>Folders</span>
            {canCreateHere && (
              <button
                onClick={() => {
                  setNewFolderName("");
                  setIsNewFolderOpen(true);
                }}
                title="Create new folder"
                className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Link
            href="/dashboard"
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentFolderId === null
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-white"
            }`}
          >
            <div className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5" />
              <span>All Workspace Files</span>
            </div>
            <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">
              {files.length}
            </span>
          </Link>

          {folders.filter(isRootFolder).map((folder) => {
            const isSelected = currentFolderId === folder.id;
            const subfolders = folders.filter((sub) => sub.parent_id === folder.id);

            return (
              <div key={folder.id} className="space-y-0.5">
                <Link
                  href={`/dashboard?folder=${folder.id}`}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-800/60 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FolderIcon className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
                    <span className="truncate">{folder.name}</span>
                  </div>
                  {folder.file_count !== undefined && folder.file_count > 0 && (
                    <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">
                      {folder.file_count}
                    </span>
                  )}
                </Link>

                {/* Nested Subfolders */}
                {subfolders.map((sub) => {
                  const isSubSelected = currentFolderId === sub.id;
                  return (
                    <Link
                      key={sub.id}
                      href={`/dashboard?folder=${sub.id}`}
                      className={`flex items-center justify-between pl-6 pr-2.5 py-1 rounded-md text-xs transition-colors ${
                        isSubSelected
                          ? "bg-zinc-800 text-zinc-100"
                          : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FolderIcon className="h-3 w-3 text-zinc-600 flex-shrink-0" />
                        <span className="truncate">{sub.name}</span>
                      </div>
                      {sub.file_count !== undefined && sub.file_count > 0 && (
                        <span className="text-[9px] bg-zinc-800 px-1 rounded text-zinc-500">
                          {sub.file_count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-zinc-800/80">
          {canCreateHere ? (
            <Button
              onClick={() => {
                setNewFileName("");
                setSelectedTemplate("ecommerce");
                setIsNewFileOpen(true);
              }}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-semibold h-8 rounded-lg flex items-center justify-center gap-1.5"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              New SQL Schema
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-1.5 h-8 rounded-lg border border-zinc-800 bg-zinc-900/50 text-[11px] font-medium text-zinc-500">
              <Eye className="h-3.5 w-3.5" />
              View-only folder
            </div>
          )}
        </div>
      </aside>

      {/* Main Workspace Dashboard Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a] overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-zinc-800/80 px-6 flex items-center justify-between gap-4 flex-shrink-0">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 overflow-hidden">
            <Link
              href="/dashboard"
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              <Database className="h-3.5 w-3.5 text-zinc-500" />
              <span>Workspace</span>
            </Link>
            {breadcrumbs.map((crumb) => (
              <React.Fragment key={crumb.id}>
                <ChevronRight className="h-3 w-3 text-zinc-700 flex-shrink-0" />
                <Link
                  href={`/dashboard?folder=${crumb.id}`}
                  className="hover:text-white transition-colors truncate max-w-[140px]"
                >
                  {crumb.name}
                </Link>
              </React.Fragment>
            ))}
          </div>

          {/* Search and Action Bar */}
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search schemas & folders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-zinc-900/80 border-zinc-800 text-white placeholder:text-zinc-500 rounded-lg"
              />
            </div>

            <div className="flex items-center border border-zinc-800 rounded-lg p-0.5 bg-zinc-900/60">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-md ${
                  viewMode === "grid" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-white"
                }`}
                title="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md ${
                  viewMode === "list" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-white"
                }`}
                title="List view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

            <NotificationsMenu
              initialNotifications={notifications}
              initialSeenAt={notificationsSeenAt}
            />
          </div>
        </header>

        {/* Scrollable Content View */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {accessDenied && (
            <div className="flex items-start gap-3 rounded-xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-red-200">
              <ShieldAlert className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-red-100">Access removed</p>
                <p className="mt-0.5 text-red-300/90">
                  You were removed from a shared schema and have been disconnected from its live
                  session. Ask an owner for access if you need it again.
                </p>
              </div>
            </div>
          )}

          {/* Subfolders Grid (if any) */}
          {filteredFolders.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <FolderIcon className="h-3.5 w-3.5 text-zinc-500" />
                Folders ({filteredFolders.length})
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredFolders.map((folder) => (
                  <div
                    key={folder.id}
                    className="group relative p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all flex items-center justify-between"
                  >
                    <Link
                      href={`/dashboard?folder=${folder.id}`}
                      className="flex items-center gap-3 overflow-hidden flex-1"
                    >
                      <div className="h-9 w-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 flex-shrink-0 group-hover:scale-105 transition-transform">
                        <FolderIcon className="h-4 w-4" />
                      </div>
                      <div className="overflow-hidden min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-xs font-medium text-zinc-200 truncate group-hover:text-zinc-100 transition-colors">
                            {folder.name}
                          </p>
                          {folder.role && (
                            <Badge
                              variant={folder.role === "owner" ? "default" : "secondary"}
                              className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 flex-shrink-0"
                            >
                              {folder.role}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-500">
                          {folder.file_count || 0} schemas
                        </p>
                      </div>
                    </Link>

                    {(folder.role === "owner" || folder.role === "editor") && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => {
                              setRenameTarget({ type: "folder", id: folder.id, name: folder.name });
                              setRenameValue(folder.name);
                            }}
                          >
                            <Edit2 className="h-3.5 w-3.5 mr-2" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setMoveTarget({ type: "folder", id: folder.id, name: folder.name });
                              setTargetFolderId(folder.parent_id);
                            }}
                          >
                            <FolderInput className="h-3.5 w-3.5 mr-2" /> Move
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              setShareTarget({ type: "folder", id: folder.id, name: folder.name })
                            }
                          >
                            <Share2 className="h-3.5 w-3.5 mr-2" /> Share &amp; Permissions
                          </DropdownMenuItem>
                          {folder.role === "owner" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  setDeleteTarget({
                                    type: "folder",
                                    id: folder.id,
                                    name: folder.name,
                                  })
                                }
                                className="text-red-400 focus:text-red-300"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Files / Schemas Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-zinc-500" />
                Schemas ({filteredFiles.length})
              </h2>
            </div>

            {filteredFiles.length === 0 ? (
              /* Empty State */
              <div className="border border-dashed border-zinc-800 rounded-2xl p-12 text-center bg-zinc-900/20 max-w-2xl mx-auto">
                <div className="h-12 w-12 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 mx-auto mb-4">
                  {canCreateHere ? (
                    <Database className="h-6 w-6" />
                  ) : (
                    <Eye className="h-6 w-6" />
                  )}
                </div>
                <h3 className="text-base font-semibold text-zinc-200">
                  {canCreateHere ? "No schemas found" : "No schemas here"}
                </h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                  {canCreateHere
                    ? "Create your first collaborative SQL schema or kickstart with a ready-to-use template."
                    : "This folder is shared with you as a viewer. You can browse its schemas, but only owners and editors can create new ones."}
                </p>

                {canCreateHere && (
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                    {SCHEMA_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl.key}
                        onClick={async () => {
                          const formData = new FormData();
                          formData.set("name", `${tmpl.name}`);
                          if (currentFolderId) formData.set("folderId", currentFolderId);
                          formData.set("templateKey", tmpl.key);
                          const res = await createFileAction(formData);
                          router.push(`/schema/${res.fileId}`);
                        }}
                        className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 hover:border-zinc-700 transition-all text-left group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-200 group-hover:text-zinc-100">
                            {tmpl.name}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" />
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2">
                          {tmpl.description}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : viewMode === "grid" ? (
              /* Grid View */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredFiles.map((file) => (
                  <div
                    key={file.id}
                    className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/90 hover:border-zinc-700/80 transition-all flex flex-col overflow-hidden shadow-lg shadow-black/20"
                  >
                    {/* Schema Card Header & Actions */}
                    <div className="p-4 flex-1">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <Link
                          href={`/schema/${file.id}`}
                          className="h-10 w-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 group-hover:border-zinc-600 group-hover:scale-105 transition-all flex-shrink-0"
                        >
                          <Database className="h-5 w-5" />
                        </Link>

                        <div className="flex items-center gap-1.5">
                          {file.role && (
                            <Badge
                              variant={file.role === "owner" ? "default" : "secondary"}
                              className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5"
                            >
                              {file.role}
                            </Badge>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem asChild>
                                <Link href={`/schema/${file.id}`}>
                                  <ExternalLink className="h-3.5 w-3.5 mr-2" /> Open Schema
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setShareTarget({ type: "file", id: file.id, name: file.name })
                                }
                              >
                                <Share2 className="h-3.5 w-3.5 mr-2" /> Share &amp; Permissions
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(file.id)}>
                                <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setRenameTarget({ type: "file", id: file.id, name: file.name });
                                  setRenameValue(file.name);
                                }}
                              >
                                <Edit2 className="h-3.5 w-3.5 mr-2" /> Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setMoveTarget({ type: "file", id: file.id, name: file.name });
                                  setTargetFolderId(file.folder_id);
                                }}
                              >
                                <FolderInput className="h-3.5 w-3.5 mr-2" /> Move to Folder
                              </DropdownMenuItem>
                              {file.role === "owner" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setDeleteTarget({
                                        type: "file",
                                        id: file.id,
                                        name: file.name,
                                      })
                                    }
                                    className="text-red-400 focus:text-red-300"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <Link href={`/schema/${file.id}`} className="block">
                        <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-indigo-300 transition-colors truncate">
                          {file.name}
                        </h3>
                        <p className="text-[11px] text-zinc-400 font-mono mt-1">PostgreSQL DDL</p>
                      </Link>
                    </div>

                    {/* Footer Info */}
                    <div className="px-4 py-2.5 bg-zinc-950/40 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-400">
                      <span>Updated {formatRelativeDate(file.updated_at)}</span>
                      <Link
                        href={`/schema/${file.id}`}
                        className="text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
                      >
                        Edit <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* List View */
              <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 uppercase font-semibold tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">Last Modified</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredFiles.map((file) => (
                      <tr key={file.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/schema/${file.id}`}
                            className="font-medium text-zinc-200 hover:text-indigo-300 flex items-center gap-2.5"
                          >
                            <Database className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                            <span className="truncate">{file.name}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {file.role && (
                            <Badge
                              variant={file.role === "owner" ? "default" : "secondary"}
                              className="text-[10px] uppercase font-semibold"
                            >
                              {file.role}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{file.owner_name || "You"}</td>
                        <td className="px-4 py-3 text-zinc-500">
                          {formatRelativeDate(file.updated_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem asChild>
                                <Link href={`/schema/${file.id}`}>
                                  <ExternalLink className="h-3.5 w-3.5 mr-2" /> Open
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setShareTarget({ type: "file", id: file.id, name: file.name })
                                }
                              >
                                <Share2 className="h-3.5 w-3.5 mr-2" /> Share
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(file.id)}>
                                <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setRenameTarget({ type: "file", id: file.id, name: file.name });
                                  setRenameValue(file.name);
                                }}
                              >
                                <Edit2 className="h-3.5 w-3.5 mr-2" /> Rename
                              </DropdownMenuItem>
                              {file.role === "owner" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setDeleteTarget({
                                        type: "file",
                                        id: file.id,
                                        name: file.name,
                                      })
                                    }
                                    className="text-red-400 focus:text-red-300"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Modal: New SQL Schema */}
      <Dialog open={isNewFileOpen} onOpenChange={setIsNewFileOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New SQL Schema</DialogTitle>
            <DialogDescription>
              Name your schema and optionally choose a starter template.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateFile} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Schema Name</label>
              <Input
                placeholder="e.g. Production Database, Analytics"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">Starter Template</label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {SCHEMA_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.key}
                    type="button"
                    onClick={() => setSelectedTemplate(tmpl.key)}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      selectedTemplate === tmpl.key
                        ? "border-indigo-500 bg-indigo-950/40 text-white"
                        : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                    }`}
                  >
                    <p className="text-xs font-semibold">{tmpl.name}</p>
                    <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                      {tmpl.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewFileOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !newFileName.trim()}>
                {isSubmitting ? "Creating..." : "Create Schema"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: New Folder */}
      <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Organize schemas into nested directory hierarchies.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateFolder} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Folder Name</label>
              <Input
                placeholder="e.g. Microservices, Core Models"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewFolderOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !newFolderName.trim()}>
                {isSubmitting ? "Creating..." : "Create Folder"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Rename */}
      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename {renameTarget?.type === "file" ? "Schema" : "Folder"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleRename} className="space-y-4">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              required
              autoFocus
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameTarget(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !renameValue.trim()}>
                {isSubmitting ? "Saving..." : "Rename"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Move */}
      <Dialog open={Boolean(moveTarget)} onOpenChange={(open) => !open && setMoveTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move {moveTarget?.name}</DialogTitle>
            <DialogDescription>Select the destination folder.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleMove} className="space-y-4">
            <div className="space-y-1 max-h-56 overflow-y-auto border border-zinc-800 rounded-lg p-2 bg-zinc-950/60">
              <button
                type="button"
                onClick={() => setTargetFolderId(null)}
                className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium flex items-center gap-2 ${
                  targetFolderId === null
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                    : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <Database className="h-3.5 w-3.5 text-indigo-400" />
                <span>Root Workspace (No folder)</span>
              </button>

              {folders
                .filter((f) => moveTarget?.type !== "folder" || f.id !== moveTarget.id)
                .map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setTargetFolderId(folder.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium flex items-center gap-2 ${
                      targetFolderId === folder.id
                        ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    <FolderIcon className="h-3.5 w-3.5 text-indigo-400" />
                    <span>{folder.name}</span>
                  </button>
                ))}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMoveTarget(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Moving..." : "Move"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Delete Confirmation */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.type === "file" ? "Schema" : "Folder"}?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Share & Permissions */}
      {shareTarget && (
        <ShareDialog
          open={Boolean(shareTarget)}
          onOpenChange={(open) => !open && setShareTarget(null)}
          resourceType={shareTarget.type}
          resourceId={shareTarget.id}
          resourceName={shareTarget.name}
          canManage={shareCanManage}
        />
      )}
    </div>
  );
}
