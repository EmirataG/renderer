export const dynamic = "force-dynamic";

import { GoogleSignInButton } from "./client";
import Image from "next/image";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black relative overflow-hidden">
      {/* Scrolling score background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/score.svg"
          alt=""
          className="w-full scroll-score-bg"
          style={{
            opacity: 0.15,
            filter: "invert(1)",
          }}
        />
      </div>

      {/* Content */}
      <div className="flex flex-col items-center relative z-10">
        {/* Logo */}
        <Image
          src="/manuscript_logo.png"
          alt="Manuscript"
          width={1000}
          height={150}
        />

        {/* Tagline */}
        <p className="text-neutral-400 uppercase tracking-widest mb-20">
          Score visualization &amp; sync
        </p>

        {/* Sign-in */}
        <GoogleSignInButton />
      </div>
    </div>
  );
}
