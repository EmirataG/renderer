'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Project } from '@/types/project';

interface ProjectCardProps {
  project: Project;
  onDelete: (id: string, name: string) => void;
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const formattedDate = new Date(project.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      onClick={() => router.push(`/project/${project.id}`)}
      className="group relative bg-black border-2 border-neutral-800 overflow-hidden hover:border-neutral-500 transition-colors cursor-pointer"
    >
      {/* Thumbnail placeholder */}
      <div className="aspect-[4/3] bg-neutral-900 flex items-center justify-center">
        <MusicNoteIcon className="w-10 h-10 text-neutral-700" />
      </div>

      {/* Metadata */}
      <div className="p-4 border-t border-neutral-800">
        <p className="text-xs font-bold uppercase tracking-wider text-neutral-200 truncate">{project.name}</p>
        <p className="text-xs text-neutral-500 mt-1 font-mono">{formattedDate}</p>
      </div>

      {/* Three-dot menu */}
      <div ref={menuRef} className="absolute top-2 right-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
          aria-label="Project options"
        >
          <MoreIcon className="w-4 h-4" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-1 w-36 bg-black border-2 border-neutral-700 shadow-xl overflow-hidden z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete(project.id, project.name);
              }}
              className="w-full text-left px-3 py-2 text-xs font-bold uppercase tracking-wider text-red-400 hover:bg-neutral-800 transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MusicNoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}
