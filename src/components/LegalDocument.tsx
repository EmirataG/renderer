import Link from "next/link";
import { ManuscriptMark } from "@/components/ManuscriptMark";

// Shared renderer for the long-form legal pages (Terms of Service, Privacy
// Policy). Keeps the two documents visually identical and in one place — the
// individual pages only supply their constants and section content.

const serif = { fontFamily: 'Georgia, "Times New Roman", serif' } as const;

export interface LegalSection {
  title: string;
  /** Leading paragraphs. */
  paras?: string[];
  /** Bulleted list rendered after the paragraphs. */
  bullets?: string[];
  /** Trailing paragraphs rendered after the bullets. */
  outro?: string[];
}

export interface LegalCrossLink {
  href: string;
  label: string;
}

interface LegalDocumentProps {
  companyName: string;
  /** e.g. "Terms of Service" or "Privacy Policy". */
  docTitle: string;
  lastUpdated: string;
  contactEmail: string;
  /** Intro paragraph under the title. */
  intro: string;
  sections: LegalSection[];
  /** Closing acknowledgement line in the footer. */
  footerNote: string;
  /** Links to sibling legal docs, shown in header + footer. */
  crossLinks?: LegalCrossLink[];
}

export function LegalDocument({
  companyName,
  docTitle,
  lastUpdated,
  contactEmail,
  intro,
  sections,
  footerNote,
  crossLinks = [],
}: LegalDocumentProps) {
  return (
    <div className="min-h-screen bg-canvas text-fg">
      {/* Header bar — mirrors the editor's top bar */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-canvas px-6 py-4">
        <Link href="/login" className="flex items-center gap-3 group">
          <ManuscriptMark className="w-5 h-5 opacity-70 group-hover:opacity-100 transition-opacity" />
        </Link>
        <div className="w-px h-4 bg-surface-muted" />
        <span className="text-[11px] font-medium uppercase tracking-widest text-fg-subtle">
          Legal
        </span>
        <div className="flex-1" />
        {crossLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-[11px] uppercase tracking-widest text-fg-subtle hover:text-fg transition-colors"
          >
            {l.label}
          </Link>
        ))}
        <Link
          href="/login"
          className="text-[11px] uppercase tracking-widest text-fg-subtle hover:text-fg transition-colors"
        >
          ← Back
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        {/* Title block */}
        <p className="text-[10px] font-bold uppercase tracking-widest text-fg-subtle mb-3">
          {companyName}
        </p>
        <h1
          className="text-3xl font-bold uppercase tracking-[0.15em] text-fg"
          style={serif}
        >
          {docTitle}
        </h1>
        <div className="mt-5 mb-6 h-0.5 w-16 bg-accent" />
        <p className="text-xs uppercase tracking-wider text-fg-subtle">
          Last updated: {lastUpdated}
        </p>

        <p className="mt-8 text-sm leading-relaxed text-fg-muted">{intro}</p>

        {/* Sections */}
        <div className="mt-12 space-y-12">
          {sections.map((section, i) => (
            <section key={section.title} className="scroll-mt-24">
              <div className="flex items-baseline gap-3">
                <span
                  className="text-sm tabular-nums text-fg-subtle"
                  style={serif}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2
                  className="text-lg font-bold uppercase tracking-wider text-fg"
                  style={serif}
                >
                  {section.title}
                </h2>
              </div>

              <div className="mt-4 pl-8 space-y-4">
                {section.paras?.map((p, j) => (
                  <p key={j} className="text-sm leading-relaxed text-fg-muted">
                    {p}
                  </p>
                ))}

                {section.bullets && (
                  <ul className="space-y-2.5">
                    {section.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
                        <span className="text-sm leading-relaxed text-fg-muted">
                          {b}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {section.outro?.map((p, j) => (
                  <p key={j} className="text-sm leading-relaxed text-fg-muted">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-20 border-t border-line pt-8">
          <p className="text-xs leading-relaxed text-fg-subtle">{footerNote}</p>
          <div className="mt-4 flex items-center gap-4 text-[11px] uppercase tracking-widest text-fg-subtle">
            <Link href="/login" className="hover:text-fg transition-colors">
              Back to {companyName}
            </Link>
            {crossLinks.map((l) => (
              <span key={l.href} className="flex items-center gap-4">
                <span className="text-fg-subtle">·</span>
                <Link href={l.href} className="hover:text-fg transition-colors">
                  {l.label}
                </Link>
              </span>
            ))}
            <span className="text-fg-subtle">·</span>
            <a
              href={`mailto:${contactEmail}`}
              className="hover:text-fg transition-colors"
            >
              Contact
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
