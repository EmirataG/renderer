export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GoogleSignInButton } from "./client";
import { SystemRequirementsButton } from "./system-requirements";
import { ScrollArrow } from "./scroll-arrow";
import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import { ManuscriptLogo } from "@/components/ManuscriptLogo";

const SHOWCASE_VIDEOS = [
  { id: "aoACVvk15ko", title: "Manuscript Demo 1" },
  { id: "4xn6EL6nL-Q", title: "Manuscript Demo 2" },
  { id: "u9xhKRkJFLw", title: "Manuscript Demo 3" },
];

export default async function LoginPage() {
  // Belt-and-suspenders: redirect authenticated users even if middleware is bypassed
  const cookieStore = await cookies();
  const session = cookieStore.get("__session")?.value;
  if (session) {
    redirect("/");
  }

  return (
    <div className="login-page">
      {/* ============ HERO SECTION ============ */}
      <section className="hero-section">
        {/* Theme switch */}
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle className="h-8" />
        </div>

        {/* Scrolling score background */}
        <div className="absolute inset-0 overflow-hidden p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/score.svg"
            alt=""
            className="w-full scroll-score-bg hero-score-bg"
          />
        </div>

        {/* Content */}
        <div className="flex flex-col items-center relative z-10">
          {/* Logo */}
          <ManuscriptLogo className="w-[min(90vw,1000px)] h-auto" />

          {/* Tagline */}
          <p className="text-fg-muted uppercase tracking-widest mb-20">
            Score visualization &amp; sync
          </p>

          {/* Sign-in */}
          <GoogleSignInButton />

          {/* System requirements link */}
          <SystemRequirementsButton />

          {/* Legal */}
          <Link
            href="/terms"
            className="mt-4 text-fg-muted hover:text-fg transition-colors text-xs uppercase tracking-widest border-b border-line-strong hover:border-fg pb-px"
          >
            Terms of Service
          </Link>
        </div>

        {/* Scroll arrow */}
        <ScrollArrow />
      </section>

      {/* ============ SHOWCASE SECTION ============ */}
      <section id="showcase" className="showcase-section">
        <div className="showcase-inner">
          <h2 className="showcase-heading">See It in Action</h2>
          <div className="showcase-divider" />

          <div className="showcase-grid">
            {SHOWCASE_VIDEOS.map((video) => (
              <div key={video.id} className="showcase-video-card">
                <div className="showcase-video-wrapper">
                  <iframe
                    src={`https://www.youtube.com/embed/${video.id}`}
                    title={video.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="showcase-video-iframe"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
