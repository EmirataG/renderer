'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function SystemRequirementsButton() {
  const [open, setOpen] = useState(false);

  // Lock page scroll while the modal is open and allow Escape to close it.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-6 text-fg-subtle hover:text-fg-muted transition-colors text-xs uppercase tracking-widest border-b border-transparent hover:border-line-strong pb-px"
      >
        System Requirements for Video Export
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md max-h-[90vh] overflow-auto border border-line bg-elevated text-fg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sysreq-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2
                id="sysreq-title"
                className="font-serif text-sm font-bold uppercase tracking-widest"
              >
                Video Export — System Requirements
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-fg-subtle hover:text-fg transition-colors ml-4 flex-shrink-0"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              <p className="text-fg-muted text-xs uppercase tracking-wider leading-relaxed">
                Video export runs entirely in your browser using your device's hardware.
                To use it, make sure you're on a supported browser and operating system.
              </p>

              {/* Supported browsers */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-fg-subtle mb-3">
                  Supported Browsers
                </p>
                <ul className="space-y-2">
                  {[
                    { name: 'Google Chrome', version: 'version 94 or newer' },
                    { name: 'Microsoft Edge', version: 'version 94 or newer' },
                    { name: 'Safari', version: 'version 16.4 or newer  (macOS & iOS)' },
                  ].map(({ name, version }) => (
                    <li key={name} className="flex items-start gap-3">
                      <span className="mt-0.5 w-1.5 h-1.5 flex-shrink-0 bg-accent rounded-full" />
                      <span className="text-xs text-fg">
                        {name}{' '}
                        <span className="text-fg-subtle">&mdash; {version}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Not supported */}
              <div className="border-t border-line pt-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-fg-subtle mb-3">
                  Not Supported
                </p>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-1.5 h-1.5 flex-shrink-0 bg-fg-subtle rounded-full" />
                  <span className="text-xs text-fg-muted">
                    Firefox — video export is not available on this browser
                  </span>
                </div>
              </div>

              {/* Additional notes */}
              <div className="border-t border-line pt-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-fg-subtle mb-3">
                  Additional Notes
                </p>
                <ul className="space-y-2">
                  {[
                    'Keep your browser up to date for the best experience.',
                    'Exporting uses your own device — no files are uploaded to a server.',
                    'Higher resolutions and longer pieces require more memory and processing time.',
                  ].map((note) => (
                    <li key={note} className="flex items-start gap-3">
                      <span className="mt-0.5 w-1.5 h-1.5 flex-shrink-0 bg-surface-muted rounded-full" />
                      <span className="text-xs text-fg-muted leading-relaxed">{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-line px-6 py-4">
              <button
                onClick={() => setOpen(false)}
                className="grunge-btn w-full text-xs"
              >
                Got it
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
