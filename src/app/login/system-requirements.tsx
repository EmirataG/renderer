'use client';

import { useState } from 'react';

export function SystemRequirementsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-6 text-neutral-500 hover:text-neutral-300 transition-colors text-xs uppercase tracking-widest border-b border-transparent hover:border-neutral-500 pb-px"
      >
        System Requirements for Video Export
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md border border-neutral-700 bg-black text-white"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sysreq-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-700 px-6 py-4">
              <h2
                id="sysreq-title"
                className="font-serif text-sm font-bold uppercase tracking-widest"
              >
                Video Export — System Requirements
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-neutral-500 hover:text-white transition-colors ml-4 flex-shrink-0"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              <p className="text-neutral-400 text-xs uppercase tracking-wider leading-relaxed">
                Video export runs entirely in your browser using your device's hardware.
                To use it, make sure you're on a supported browser and operating system.
              </p>

              {/* Supported browsers */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-3">
                  Supported Browsers
                </p>
                <ul className="space-y-2">
                  {[
                    { name: 'Google Chrome', version: 'version 94 or newer' },
                    { name: 'Microsoft Edge', version: 'version 94 or newer' },
                    { name: 'Safari', version: 'version 16.4 or newer  (macOS & iOS)' },
                  ].map(({ name, version }) => (
                    <li key={name} className="flex items-start gap-3">
                      <span className="mt-0.5 w-1.5 h-1.5 flex-shrink-0 bg-white rounded-full" />
                      <span className="text-xs text-white">
                        {name}{' '}
                        <span className="text-neutral-500">&mdash; {version}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Not supported */}
              <div className="border-t border-neutral-800 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-3">
                  Not Supported
                </p>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-1.5 h-1.5 flex-shrink-0 bg-neutral-600 rounded-full" />
                  <span className="text-xs text-neutral-400">
                    Firefox — video export is not available on this browser
                  </span>
                </div>
              </div>

              {/* Additional notes */}
              <div className="border-t border-neutral-800 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-3">
                  Additional Notes
                </p>
                <ul className="space-y-2">
                  {[
                    'Keep your browser up to date for the best experience.',
                    'Exporting uses your own device — no files are uploaded to a server.',
                    'Higher resolutions and longer pieces require more memory and processing time.',
                  ].map((note) => (
                    <li key={note} className="flex items-start gap-3">
                      <span className="mt-0.5 w-1.5 h-1.5 flex-shrink-0 bg-neutral-700 rounded-full" />
                      <span className="text-xs text-neutral-400 leading-relaxed">{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-neutral-700 px-6 py-4">
              <button
                onClick={() => setOpen(false)}
                className="grunge-btn w-full text-xs"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
