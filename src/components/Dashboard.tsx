"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase-client";
import { useToast } from "@/hooks/useToast";
import { ProjectCard } from "@/components/ProjectCard";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { useTheme } from "@/hooks/useTheme";
import {
  PlusIcon,
  GearIcon,
  SunIcon,
  MoonIcon,
  TermsIcon,
  SignOutIcon,
  EmptyMusicIcon,
} from "@/components/icons";
import type { Project } from "@/types/project";

interface DashboardProps {
  initialProjects: Project[];
}

export function Dashboard({ initialProjects }: DashboardProps) {
  const router = useRouter();
  const { show: showToast } = useToast();

  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated');
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Track pending delete timeouts so we can clean up on unmount
  const pendingDeletes = useRef<
    Map<string, { timeout: ReturnType<typeof setTimeout>; projectId: string }>
  >(new Map());

  // On unmount, fire any pending deletes immediately
  useEffect(() => {
    return () => {
      pendingDeletes.current.forEach(({ timeout, projectId }) => {
        clearTimeout(timeout);
        fetch(`/api/projects/${projectId}`, { method: "DELETE" }).catch(
          () => {},
        );
      });
      pendingDeletes.current.clear();
    };
  }, []);

  const handleCreated = useCallback((project: Project) => {
    setProjects((prev) => [project, ...prev]);
  }, []);

  const handleDeleteRequest = useCallback(
    (projectId: string, projectName: string) => {
      setDeleteConfirm({ id: projectId, name: projectName });
    },
    [],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteConfirm) return;
    const { id: projectId, name: projectName } = deleteConfirm;
    setDeleteConfirm(null);

    // Store the deleted project for potential undo
    const deletedProject = projects.find((p) => p.id === projectId);
    if (!deletedProject) return;

    // Optimistic removal
    setProjects((prev) => prev.filter((p) => p.id !== projectId));

    // Schedule actual deletion after 5 seconds
    const timeout = setTimeout(() => {
      pendingDeletes.current.delete(projectId);
      fetch(`/api/projects/${projectId}`, { method: "DELETE" }).catch(() => {
        // If delete fails, we can't easily restore since 5s passed
        // Just log silently
      });
    }, 5000);

    pendingDeletes.current.set(projectId, { timeout, projectId });

    // Undo function
    const undoFn = () => {
      const pending = pendingDeletes.current.get(projectId);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingDeletes.current.delete(projectId);
      }
      // Restore the project to its original position
      setProjects((prev) => {
        // Insert back in order by updatedAt desc
        const updated = [...prev, deletedProject].sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        return updated;
      });
    };

    showToast(`"${projectName}" deleted`, "info", {
      action: { label: "Undo", onClick: undoFn },
      duration: 5000,
    });
  }, [deleteConfirm, projects, showToast]);

  const handleDuplicate = useCallback(
    async (projectId: string) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/duplicate`, {
          method: "POST",
        });
        if (!res.ok) throw new Error("Duplicate failed");
        const { project } = await res.json();
        setProjects((prev) => [project, ...prev]);
        showToast(`"${project.name}" created`, "success");
      } catch {
        showToast("Failed to duplicate project", "error");
      }
    },
    [showToast],
  );

  const handleSignOut = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    await signOut(auth);
    router.push("/login");
  }, [router]);

  const sortedProjects = [...projects].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      case "created":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "updated":
      default:
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
  });

  return (
    <main className="min-h-screen bg-canvas text-fg">
      {/* Header */}
      <header className="relative border-b border-line px-6 py-4">
        {/* Staff lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-50">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-full"
              style={{ height: 2, backgroundColor: "#9f9f9f" }}
            />
          ))}
        </div>
        <div className="max-w-7xl mx-auto flex items-center justify-between relative">
          <h1
            className="text-3xl font-bold tracking-wider uppercase"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            Manuscript
          </h1>
          <div className="flex items-stretch gap-2">
            {/* Sort control */}
            {projects.length > 0 && (
              <SortMenu value={sortBy} onChange={setSortBy} />
            )}
            {/* Layout toggle */}
            {projects.length > 0 && (
              <div className="flex border border-line-strong overflow-hidden mr-1 bg-canvas">
                <button
                  onClick={() => setLayoutMode('grid')}
                  className={`px-2.5 flex items-center transition-colors ${layoutMode === 'grid' ? 'bg-accent text-accent-fg' : 'text-fg-subtle hover:text-fg'}`}
                  title="Grid view"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="1" y="1" width="6" height="6" />
                    <rect x="9" y="1" width="6" height="6" />
                    <rect x="1" y="9" width="6" height="6" />
                    <rect x="9" y="9" width="6" height="6" />
                  </svg>
                </button>
                <button
                  onClick={() => setLayoutMode('list')}
                  className={`px-2.5 flex items-center transition-colors ${layoutMode === 'list' ? 'bg-accent text-accent-fg' : 'text-fg-subtle hover:text-fg'}`}
                  title="List view"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="1" y="2" width="14" height="2.5" />
                    <rect x="1" y="6.75" width="14" height="2.5" />
                    <rect x="1" y="11.5" width="14" height="2.5" />
                  </svg>
                </button>
              </div>
            )}
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="grunge-btn-primary"
            >
              New Project
            </button>
            <SettingsMenu onSignOut={handleSignOut} />
          </div>
        </div>
        <img
          src="/final_barline.png"
          alt=""
          className="absolute right-0 top-0 h-full w-auto pointer-events-none"
        />
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {projects.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-surface-muted mb-4">
              <EmptyMusicIcon className="w-8 h-8 text-fg-subtle" />
            </div>
            <h2
              className="text-lg font-bold tracking-wider uppercase text-fg-muted mb-2"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              No projects yet
            </h2>
            <p className="text-sm text-fg-subtle mb-6 max-w-sm">
              Create your first project to start syncing scores with audio.
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="grunge-btn-primary"
            >
              New Project
            </button>
          </div>
        ) : (
          layoutMode === 'grid' ? (
            /* Grid view */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onDelete={handleDeleteRequest}
                  onDuplicate={handleDuplicate}
                />
              ))}
              <NewProjectCard onClick={() => setIsCreateModalOpen(true)} />
            </div>
          ) : (
            /* List view */
            <div className="border border-line divide-y divide-line">
              {sortedProjects.map((project) => (
                <ProjectListRow
                  key={project.id}
                  project={project}
                  onDelete={handleDeleteRequest}
                  onDuplicate={handleDuplicate}
                />
              ))}
              <NewProjectListRow onClick={() => setIsCreateModalOpen(true)} />
            </div>
          )
        )}
      </div>

      {/* Create modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleCreated}
      />

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteConfirm(null);
          }}
        >
          <div className="bg-canvas border-2 border-line-strong p-6 max-w-sm w-full mx-4">
            <h3
              className="text-xs font-bold uppercase tracking-wider text-fg mb-2"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              Delete project?
            </h3>
            <p className="text-sm text-fg-muted mb-6">
              Delete &ldquo;{deleteConfirm.name}&rdquo;? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="grunge-btn grunge-btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="grunge-btn grunge-btn-sm border-red-500 text-red-400 hover:bg-red-500 hover:text-fg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ProjectListRow({
  project,
  onDelete,
  onDuplicate,
}: {
  project: Project;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const router = useRouter();

  const formattedDate = new Date(project.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      onClick={() => router.push(`/project/${project.id}`)}
      className="group flex items-center gap-4 px-4 py-3 hover:bg-surface-muted transition-colors cursor-pointer"
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-fg truncate flex-1 min-w-0">
        {project.name}
      </span>
      <span className="text-[11px] text-fg-subtle shrink-0">
        {formattedDate}
      </span>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(project.id);
          }}
          className="p-1.5 text-fg-subtle hover:text-fg hover:bg-surface-muted transition-colors"
          title="Duplicate"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project.id, project.name);
          }}
          className="p-1.5 text-fg-subtle hover:text-red-400 hover:bg-surface-muted transition-colors"
          title="Delete"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3,6 5,6 21,6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

type SortOption = 'updated' | 'created' | 'name';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'updated', label: 'Last updated' },
  { value: 'created', label: 'Date added' },
  { value: 'name', label: 'Name (A–Z)' },
];

function SortMenu({
  value,
  onChange,
}: {
  value: SortOption;
  onChange: (value: SortOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const activeLabel =
    SORT_OPTIONS.find((o) => o.value === value)?.label ?? 'Sort';

  return (
    <div ref={ref} className="relative mr-1">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="h-full flex items-center gap-2 border border-line-strong bg-canvas px-3 text-xs font-bold uppercase tracking-wider text-fg-muted hover:text-fg hover:border-line-strong transition-colors"
        title="Sort projects"
      >
        <span>{activeLabel}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="2,4 6,8 10,4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-canvas border-2 border-line-strong shadow-xl overflow-hidden z-20">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors hover:bg-surface-muted ${
                option.value === value
                  ? 'text-fg bg-surface'
                  : 'text-fg-muted'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsMenu({ onSignOut }: { onSignOut: () => void }) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const itemClass =
    'w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-fg-muted hover:text-fg hover:bg-surface-muted transition-colors';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="h-full flex items-center justify-center border border-line-strong bg-canvas px-2.5 text-fg-muted hover:text-fg hover:border-fg transition-colors"
        title="Settings"
        aria-label="Settings"
        aria-expanded={open}
      >
        <GearIcon className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-52 bg-canvas border-2 border-line-strong shadow-xl overflow-hidden z-20">
          <button
            onClick={() => toggleTheme()}
            className={itemClass}
          >
            {isLight ? <MoonIcon className="w-4 h-4 shrink-0" /> : <SunIcon className="w-4 h-4 shrink-0" />}
            <span>{isLight ? 'Dark mode' : 'Light mode'}</span>
          </button>
          <button
            onClick={() => {
              setOpen(false);
              router.push('/terms');
            }}
            className={itemClass}
          >
            <TermsIcon className="w-4 h-4 shrink-0" />
            <span>Review terms</span>
          </button>
          <div className="border-t border-line" />
          <button
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className={itemClass}
          >
            <SignOutIcon className="w-4 h-4 shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}

function NewProjectCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center justify-center bg-canvas border-2 border-dashed border-line hover:border-line-strong transition-colors cursor-pointer min-h-full"
    >
      <div className="aspect-[4/3] w-full flex flex-col items-center justify-center gap-3 text-fg-subtle group-hover:text-fg-muted transition-colors">
        <PlusIcon className="w-10 h-10" />
        <span className="text-xs font-bold uppercase tracking-wider">New Project</span>
      </div>
    </button>
  );
}

function NewProjectListRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full flex items-center gap-3 px-4 py-3 text-fg-subtle hover:text-fg hover:bg-surface-muted transition-colors cursor-pointer"
    >
      <PlusIcon className="w-4 h-4" />
      <span className="text-xs font-semibold uppercase tracking-wider">New Project</span>
    </button>
  );
}

