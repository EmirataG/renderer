'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useToast } from '@/hooks/useToast';
import { ProjectCard } from '@/components/ProjectCard';
import { CreateProjectModal } from '@/components/CreateProjectModal';
import type { Project } from '@/types/project';

interface DashboardProps {
  initialProjects: Project[];
}

export function Dashboard({ initialProjects }: DashboardProps) {
  const router = useRouter();
  const { show: showToast } = useToast();

  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Track pending delete timeouts so we can clean up on unmount
  const pendingDeletes = useRef<Map<string, { timeout: ReturnType<typeof setTimeout>; projectId: string }>>(new Map());

  // On unmount, fire any pending deletes immediately
  useEffect(() => {
    return () => {
      pendingDeletes.current.forEach(({ timeout, projectId }) => {
        clearTimeout(timeout);
        fetch(`/api/projects/${projectId}`, { method: 'DELETE' }).catch(() => {});
      });
      pendingDeletes.current.clear();
    };
  }, []);

  const handleCreated = useCallback((project: Project) => {
    setProjects((prev) => [project, ...prev]);
  }, []);

  const handleDeleteRequest = useCallback((projectId: string, projectName: string) => {
    setDeleteConfirm({ id: projectId, name: projectName });
  }, []);

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
      fetch(`/api/projects/${projectId}`, { method: 'DELETE' }).catch(() => {
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
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        return updated;
      });
    };

    showToast(`"${projectName}" deleted`, 'info', {
      action: { label: 'Undo', onClick: undoFn },
      duration: 5000,
    });
  }, [deleteConfirm, projects, showToast]);

  const handleSignOut = useCallback(async () => {
    await fetch('/api/auth/session', { method: 'DELETE' });
    await signOut(auth);
    router.push('/login');
  }, [router]);

  return (
    <main className="min-h-screen bg-black text-neutral-100">
      {/* Header */}
      <header className="border-b border-neutral-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-wider uppercase" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Manuscript</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="grunge-btn-primary"
            >
              New Project
            </button>
            <button
              onClick={handleSignOut}
              className="grunge-btn grunge-btn-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {projects.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-neutral-800/50 mb-4">
              <EmptyMusicIcon className="w-8 h-8 text-neutral-500" />
            </div>
            <h2 className="text-lg font-bold tracking-wider uppercase text-neutral-300 mb-2" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>No projects yet</h2>
            <p className="text-sm text-neutral-500 mb-6 max-w-sm">
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
          /* Project grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>
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
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteConfirm(null);
          }}
        >
          <div className="bg-black border-2 border-neutral-700 p-6 max-w-sm w-full mx-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-100 mb-2" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Delete project?</h3>
            <p className="text-sm text-neutral-400 mb-6">
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
                className="grunge-btn grunge-btn-sm border-red-500 text-red-400 hover:bg-red-500 hover:text-white"
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

function EmptyMusicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}
