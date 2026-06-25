"use client";
import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "motion/react";

export function LandingNav() {
  const { scrollY } = useScroll();
  const bgOpacity = useTransform(scrollY, [0, 60], [0, 1]);

  return (
    <header className="fixed top-0 left-0 right-0 z-40">
      <motion.div
        className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/[0.06]"
        style={{ opacity: bgOpacity }}
      />
      <nav className="relative max-w-[1400px] mx-auto px-6 md:px-12 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="font-bold text-white text-lg tracking-tight select-none flex items-center gap-2.5 group"
        >
          <Image
            src="/logo.png"
            alt="Fayde"
            width={24}
            height={24}
            className="size-6 rounded-md object-contain transition-transform duration-300 group-hover:scale-105"
          />
          <span className="group-hover:text-zinc-200 transition-colors duration-200">Fayde</span>
        </Link>
        <div className="flex items-center">
          <Link
            href="/login"
            className="bg-white text-black text-sm font-semibold px-5 py-2 rounded-full hover:bg-zinc-100 transition-colors duration-200 active:scale-[0.97] flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>Launch Web App</span>
            <svg className="size-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </Link>
        </div>
      </nav>
    </header>
  );
}
