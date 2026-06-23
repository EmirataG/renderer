import type { Metadata } from "next";
import Link from "next/link";
import { ManuscriptMark } from "@/components/ManuscriptMark";

// ─────────────────────────────────────────────────────────────────────────
// EDIT THESE before launch (and have a lawyer review the whole document).
// ─────────────────────────────────────────────────────────────────────────
const COMPANY_NAME = "Manuscript";
const CONTACT_EMAIL = "support@manuscript.app";
const GOVERNING_LAW = "your jurisdiction";
const LAST_UPDATED = "June 13, 2026";
// ─────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Terms of Service — Manuscript",
  description: `Terms of Service for ${COMPANY_NAME}, a score visualization and sync tool.`,
};

const serif = { fontFamily: 'Georgia, "Times New Roman", serif' } as const;

interface Section {
  title: string;
  paras?: string[];
  bullets?: string[];
  outro?: string[];
}

const SECTIONS: Section[] = [
  {
    title: "Acceptance of Terms",
    paras: [
      `These Terms of Service ("Terms") govern your access to and use of ${COMPANY_NAME} (the "Service"), a web application that turns musical scores and audio recordings into synchronized score-animation videos. By creating an account or otherwise using the Service, you agree to be bound by these Terms.`,
      `If you do not agree to these Terms, do not use the Service. If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization to these Terms.`,
    ],
  },
  {
    title: "The Service",
    paras: [
      `${COMPANY_NAME} lets you upload a music score (MusicXML, MXL, or MEI), an audio recording, and an optional background image; align score events to the audio; preview the synchronized animation; and export it as a video. Video export is rendered and encoded entirely on your own device — exported files are not uploaded to or stored on our servers.`,
      `The Service is under active development and may be offered on a pre-release or "beta" basis. Features may change, be added, or be removed at any time.`,
    ],
  },
  {
    title: "Accounts & Eligibility",
    paras: [
      `Some features require an account, which you create through a third-party sign-in provider. You are responsible for all activity that occurs under your account and for maintaining the security of the credentials used to access it.`,
    ],
    bullets: [
      "You must be at least 13 years old, or the minimum age of digital consent in your country, to use the Service.",
      "You agree to provide accurate information and to keep it current.",
      "You are responsible for any content uploaded and any actions taken through your account.",
      "Notify us promptly of any unauthorized use of your account.",
    ],
  },
  {
    title: "Your Content & Ownership",
    paras: [
      `"Your Content" means the scores, audio, images, project settings, and other material you upload to or create within the Service. You retain all ownership rights in Your Content. We do not claim ownership of it.`,
      `To operate the Service, you grant ${COMPANY_NAME} a limited, non-exclusive, worldwide, royalty-free license to host, store, reproduce, process, and display Your Content solely for the purpose of providing the Service to you (for example, to render your score, store your project, and stream your files back to your browser). This license ends when Your Content is deleted, except for residual copies retained transiently or in routine backups for a limited period.`,
    ],
  },
  {
    title: "Content Rights & Copyright",
    paras: [
      `Musical works and recordings are frequently protected by copyright. You are solely responsible for ensuring you have all rights necessary to upload and use Your Content.`,
    ],
    bullets: [
      "You represent and warrant that you own Your Content, or have obtained all licenses, permissions, and consents required to upload and use it within the Service.",
      "You agree not to upload content that infringes any copyright, trademark, or other right of a third party.",
      "We respect the intellectual-property rights of others and expect you to do the same.",
    ],
    outro: [
      `If you believe content on the Service infringes your rights, contact us at ${CONTACT_EMAIL} with enough detail to identify the work and the allegedly infringing material. We may remove content, disable access, and terminate accounts of users who repeatedly infringe.`,
    ],
  },
  {
    title: "Acceptable Use",
    paras: ["You agree not to:"],
    bullets: [
      "Upload, store, or share unlawful, infringing, harmful, or deceptive content.",
      "Upload personal data about others without the rights or consent to do so.",
      "Attempt to disrupt, overload, probe, or gain unauthorized access to the Service or its infrastructure.",
      "Reverse engineer, decompile, or attempt to extract source code, except where such restriction is prohibited by law.",
      "Use automated means to access the Service in a way that imposes an unreasonable load, or to scrape or bulk-download content you do not own.",
      "Use the Service to build a competing product, or resell access without our written permission.",
    ],
  },
  {
    title: "Service Availability & Data",
    paras: [
      `We strive to keep the Service available and reliable, but we do not guarantee uninterrupted or error-free operation. We may modify, suspend, or discontinue any part of the Service at any time, with or without notice.`,
      `We do not guarantee that Your Content will be retained indefinitely or that it cannot be lost. You are responsible for keeping your own copies of any content and exported videos that matter to you.`,
    ],
  },
  {
    title: "Fees",
    paras: [
      `The Service is currently provided free of charge. We may introduce paid features, plans, or usage limits in the future. If we do, we will make the applicable pricing and terms available before you incur any charge, and your continued use of paid features after that point constitutes acceptance of those terms.`,
    ],
  },
  {
    title: "Intellectual Property",
    paras: [
      `The Service, including its software, design, text, graphics, logos, and the "${COMPANY_NAME}" name and branding, is owned by ${COMPANY_NAME} or its licensors and is protected by intellectual-property laws. Subject to these Terms, you are granted a limited, revocable, non-transferable license to use the Service for its intended purpose. No rights are granted to you in our intellectual property except as expressly stated here.`,
    ],
  },
  {
    title: "Third-Party Services",
    paras: [
      `The Service relies on third-party providers — including Google and Firebase for authentication and storage, and embedded video players for demonstration content. Your use of those features may be subject to the third parties' own terms and privacy policies. We are not responsible for third-party services and do not control them.`,
    ],
  },
  {
    title: "Disclaimer of Warranties",
    paras: [
      `THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT SCORE RENDERING, TIMING, OR VIDEO EXPORT WILL BE ACCURATE, UNINTERRUPTED, OR ERROR-FREE, OR THAT THE SERVICE WILL WORK ON ANY PARTICULAR DEVICE OR BROWSER.`,
    ],
  },
  {
    title: "Limitation of Liability",
    paras: [
      `TO THE MAXIMUM EXTENT PERMITTED BY LAW, ${COMPANY_NAME.toUpperCase()} AND ITS OPERATORS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF DATA, PROFITS, OR GOODWILL, ARISING OUT OF OR RELATING TO YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF THE AMOUNT YOU PAID US IN THE TWELVE MONTHS BEFORE THE CLAIM OR ONE HUNDRED (100) UNITS OF YOUR LOCAL CURRENCY.`,
    ],
  },
  {
    title: "Indemnification",
    paras: [
      `You agree to indemnify and hold harmless ${COMPANY_NAME} and its operators from any claims, damages, liabilities, and expenses (including reasonable legal fees) arising out of Your Content, your use of the Service, or your violation of these Terms or of any law or third-party right.`,
    ],
  },
  {
    title: "Termination",
    paras: [
      `You may stop using the Service at any time and may delete your projects or account. We may suspend or terminate your access to the Service, with or without notice, if you violate these Terms or if we reasonably believe your use poses a risk to the Service or others.`,
      `Upon termination, your right to use the Service ends, and we may delete Your Content. Provisions that by their nature should survive termination — including ownership, disclaimers, limitation of liability, and indemnification — will survive.`,
    ],
  },
  {
    title: "Changes to These Terms",
    paras: [
      `We may update these Terms from time to time. When we do, we will revise the "Last updated" date above and, for material changes, take reasonable steps to notify you. Your continued use of the Service after the changes take effect constitutes acceptance of the revised Terms.`,
    ],
  },
  {
    title: "Governing Law",
    paras: [
      `These Terms are governed by the laws of ${GOVERNING_LAW}, without regard to its conflict-of-laws rules. You agree to the exclusive jurisdiction of the courts located there for any dispute arising out of or relating to these Terms or the Service, except where prohibited by applicable law.`,
    ],
  },
  {
    title: "Contact",
    paras: [`Questions about these Terms can be sent to ${CONTACT_EMAIL}.`],
  },
];

export default function TermsPage() {
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
          {COMPANY_NAME}
        </p>
        <h1
          className="text-3xl font-bold uppercase tracking-[0.15em] text-fg"
          style={serif}
        >
          Terms of Service
        </h1>
        <div className="mt-5 mb-6 h-0.5 w-16 bg-accent" />
        <p className="text-xs uppercase tracking-wider text-fg-subtle">
          Last updated: {LAST_UPDATED}
        </p>

        <p className="mt-8 text-sm leading-relaxed text-fg-muted">
          Please read these Terms carefully before using {COMPANY_NAME}. They
          set out the rules for using the Service and the rights and
          responsibilities of both you and us.
        </p>

        {/* Sections */}
        <div className="mt-12 space-y-12">
          {SECTIONS.map((section, i) => (
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
                  <p
                    key={j}
                    className="text-sm leading-relaxed text-fg-muted"
                  >
                    {p}
                  </p>
                ))}

                {section.bullets && (
                  <ul className="space-y-2.5">
                    {section.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-fg-subtle" />
                        <span className="text-sm leading-relaxed text-fg-muted">
                          {b}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {section.outro?.map((p, j) => (
                  <p
                    key={j}
                    className="text-sm leading-relaxed text-fg-muted"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-20 border-t border-line pt-8">
          <p className="text-xs leading-relaxed text-fg-subtle">
            By continuing to use {COMPANY_NAME}, you acknowledge that you have
            read and agree to these Terms of Service.
          </p>
          <div className="mt-4 flex items-center gap-4 text-[11px] uppercase tracking-widest text-fg-subtle">
            <Link
              href="/login"
              className="hover:text-fg transition-colors"
            >
              Back to {COMPANY_NAME}
            </Link>
            <span className="text-fg-subtle">·</span>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
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
