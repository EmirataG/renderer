export const dynamic = "force-dynamic";

import { GoogleSignInButton } from "./client";
import Image from "next/image";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="flex flex-col items-center">
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
