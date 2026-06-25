"use client";
import Image from "next/image";
import { motion, useReducedMotion, useAnimate } from "motion/react";
import { useEffect, useState } from "react";

const words = [
  { text: "Think", muted: false },
  { text: "less.", muted: true },
  { text: "Do", muted: false },
  { text: "more.", muted: false },
];

const RING_COUNT = 4;
const RING_DURATION = 4.5;

export function HeroSection() {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate();

  const [downloadLink, setDownloadLink] = useState<{
    url: string;
    label: string;
    os: "mac" | "windows" | "other";
  }>({
    url: "https://github.com/SachPlayZ/Fayde/releases/download/v0.1.0/Fayde_0.1.0_universal.dmg",
    label: "Download App",
    os: "other",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = window.navigator.userAgent.toLowerCase();

    const macUrl = "https://github.com/SachPlayZ/Fayde/releases/download/v0.1.0/Fayde_0.1.0_universal.dmg";
    const winUrl = "https://github.com/SachPlayZ/Fayde/releases/download/v0.1.0/Fayde_0.1.0_x64-setup.exe";

    let linkConfig: { url: string; label: string; os: "mac" | "windows" | "other" };

    if (ua.includes("mac")) {
      linkConfig = { url: macUrl, label: "Download for macOS", os: "mac" };
    } else if (ua.includes("win")) {
      linkConfig = { url: winUrl, label: "Download for Windows", os: "windows" };
    } else {
      linkConfig = { url: macUrl, label: "Download for macOS", os: "mac" };
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDownloadLink(linkConfig);
  }, []);

  useEffect(() => {
    if (!scope.current) return;
    let live = true;

    async function run() {
      if (reduce) {
        animate(scope.current, { opacity: 1, y: 0 }, { duration: 0 });
        if (live) {
          animate(scope.current, { y: [-6, 6, -6] }, {
            duration: 6, repeat: Infinity, ease: [0.45, 0, 0.55, 1],
          });
        }
        return;
      }

      // Phase 1: flat on ground (diagonal) → rise up like a 3D badge
      await animate(scope.current, {
        rotateX: [76, 8, 0],
        rotateY: [12, 3, 0],
        rotateZ: [-20, -4, 0],
        y: [110, -14, 0],
        opacity: [0, 1, 1],
        scale: [0.72, 1.07, 1],
      }, {
        duration: 1.7,
        ease: [0.16, 1, 0.3, 1],
      });

      // Phase 2: gentle float loop
      if (live) {
        animate(scope.current, { y: [-8, 8, -8] }, {
          duration: 6, repeat: Infinity, ease: [0.45, 0, 0.55, 1],
        });
      }
    }

    run();
    return () => { live = false; };
  }, [reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section
      className="relative min-h-[100dvh] flex flex-col justify-center px-6 md:px-12 lg:px-24 pt-20 pb-16 overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-[#0a0a0a]/60 to-transparent pointer-events-none hidden lg:block" />

      <div className="relative max-w-[1400px] mx-auto w-full flex flex-col lg:flex-row items-center justify-between gap-16 lg:gap-8 z-10">
        {/* Left Column: Heading and CTA */}
        <div className="flex-1 min-w-0 w-full">
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="font-mono text-zinc-600 text-[11px] uppercase tracking-[0.24em] mb-10"
          >
            Personal productivity suite
          </motion.p>

          <h1 className="text-[clamp(3.8rem,10.5vw,10.5rem)] font-bold leading-[0.9] tracking-[-0.04em] mb-12">
            {words.map((word, i) => (
              <motion.span
                key={i}
                className={`block ${word.muted ? "text-zinc-600" : "text-white"}`}
                initial={reduce ? false : { opacity: 0, y: 70, filter: "blur(12px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{
                  duration: 0.9,
                  delay: 0.08 + i * 0.14,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {word.text}
              </motion.span>
            ))}
          </h1>

          <div className="flex flex-col gap-8 md:flex-row md:items-center md:gap-12">
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="text-zinc-400 text-lg leading-relaxed max-w-[40ch]"
            >
              Tasks, habits, goals, projects, and docs. All yours. Zero friction.
            </motion.p>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.85, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col gap-4 flex-shrink-0"
            >
              <div className="flex items-center">
                <a
                  href={downloadLink.url}
                  className="bg-white text-black font-semibold px-7 py-3.5 rounded-full hover:bg-zinc-100 transition-all duration-200 active:scale-[0.97] text-sm whitespace-nowrap flex items-center gap-2 shadow-lg"
                >
                  {downloadLink.os === "mac" && (
                    <svg className="size-4 fill-current" viewBox="0 0 170 170">
                      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.38.13-9.13-1.91-14.26-6.12-3.23-2.61-7.14-7.22-11.75-13.85-8.86-12.8-15.53-27.46-20.02-43.99-4.5-16.53-6.75-32.06-6.75-46.6 0-16.32 3.96-29.83 11.89-40.54 7.93-10.71 18.06-16.19 30.38-16.44 6.75-.12 13.51 1.76 20.29 5.65 6.78 3.89 11.23 5.84 13.35 5.84 2.11 0 6.64-1.95 13.56-5.84 6.93-3.89 13.43-5.71 19.51-5.46 12.12.5 21.91 4.88 29.38 13.14 7.46 8.25 11.66 18.57 12.61 30.93-12.45 5.09-21.73 12.59-27.84 22.52-6.11 9.93-9.17 21.05-9.17 33.37 0 9.8 2.37 18.42 7.12 25.86 4.75 7.44 11.08 13.14 19 17.11-2.91 8.76-6.78 17.47-11.61 26.13zM119.22 30.25c0-8.23 2.76-15.89 8.28-22.96 5.53-7.08 12.42-11.67 20.67-13.79.13 1.13.2 2.13.2 3.01 0 8.01-2.96 15.65-8.88 22.92-5.91 7.28-13.09 12-21.52 14.18-.88-2.12-1.35-5.89-1.35-11.36z" />
                    </svg>
                  )}
                  {downloadLink.os === "windows" && (
                    <svg className="size-4 fill-current" viewBox="0 0 88 88">
                      <path d="M0 12v30.43l35.22-.09V8.57zM39.13 7.57v34.87l48.87.13V0zM0 45.43V76l35.22 3.43V45.34zM39.13 45.34v35.09l48.87 3.57V45.47z" />
                    </svg>
                  )}
                  {downloadLink.label}
                </a>
              </div>
              <div className="pl-1">
                {downloadLink.os === "mac" ? (
                  <a
                    href="https://github.com/SachPlayZ/Fayde/releases/download/v0.1.0/Fayde_0.1.0_x64-setup.exe"
                    className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors duration-200"
                  >
                    Looking for Windows? <span className="underline">Download for Windows (.exe)</span>
                  </a>
                ) : downloadLink.os === "windows" ? (
                  <a
                    href="https://github.com/SachPlayZ/Fayde/releases/download/v0.1.0/Fayde_0.1.0_universal.dmg"
                    className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors duration-200"
                  >
                    Looking for macOS? <span className="underline">Download for macOS (.dmg)</span>
                  </a>
                ) : (
                  <div className="flex items-center gap-3 text-zinc-600 text-xs">
                    <span>Downloads:</span>
                    <a
                      href="https://github.com/SachPlayZ/Fayde/releases/download/v0.1.0/Fayde_0.1.0_universal.dmg"
                      className="text-zinc-500 hover:text-zinc-300 underline transition-colors duration-200"
                    >
                      macOS (.dmg)
                    </a>
                    <span>|</span>
                    <a
                      href="https://github.com/SachPlayZ/Fayde/releases/download/v0.1.0/Fayde_0.1.0_x64-setup.exe"
                      className="text-zinc-500 hover:text-zinc-300 underline transition-colors duration-200"
                    >
                      Windows (.exe)
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Right Column: Logo */}
        <div
          className="relative flex-shrink-0 w-full max-w-[380px] sm:max-w-[450px] aspect-square flex items-center justify-center select-none overflow-visible"
          style={{ perspective: "1200px" }}
        >
          {/* Layered ambient glow */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              animate={{ scale: [1, 1.18, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 7, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
              className="absolute size-[200px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 45%, transparent 70%)" }}
            />
            <motion.div
              animate={{ scale: [1.12, 0.94, 1.12], opacity: [0.35, 0.6, 0.35] }}
              transition={{ duration: 10, repeat: Infinity, ease: [0.45, 0, 0.55, 1], delay: 2 }}
              className="absolute size-[360px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 60%)" }}
            />
          </div>

          {/* Concentric ring pulses */}
          {!reduce &&
            Array.from({ length: RING_COUNT }).map((_, i) => (
              <div key={i} className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <motion.div
                  className="rounded-full"
                  style={{ width: 160, height: 160, border: "1px solid rgba(255,255,255,0.45)" }}
                  initial={{ scale: 0.35, opacity: 0 }}
                  animate={{ scale: [0.35, 2.4], opacity: [0, 0.22, 0.14, 0] }}
                  transition={{
                    duration: RING_DURATION,
                    repeat: Infinity,
                    delay: i * (RING_DURATION / RING_COUNT),
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                />
              </div>
            ))}

          {/* Outer orbital */}
          {!reduce && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
                className="rounded-full"
                style={{
                  width: 290,
                  height: 290,
                  border: "1px solid transparent",
                  borderTopColor: "rgba(255,255,255,0.09)",
                  borderRightColor: "rgba(255,255,255,0.04)",
                }}
              />
            </div>
          )}

          {/* Inner orbital */}
          {!reduce && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 34, repeat: Infinity, ease: "linear" }}
                className="rounded-full"
                style={{
                  width: 230,
                  height: 230,
                  border: "1px solid transparent",
                  borderBottomColor: "rgba(255,255,255,0.07)",
                  borderLeftColor: "rgba(255,255,255,0.03)",
                }}
              />
            </div>
          )}

          {/* Logo — 3D badge rising from ground */}
          <motion.div
            ref={scope}
            style={{ opacity: 0 }}
            className="relative z-10 size-44 sm:size-56 rounded-[3rem] bg-zinc-950/80 border border-white/10 p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8),_0_0_30px_rgba(255,255,255,0.03)] flex items-center justify-center backdrop-blur-xl"
          >
            <Image
              src="/logo.png"
              alt="Fayde Logo"
              width={224}
              height={224}
              className="size-full object-contain rounded-[2.2rem] select-none"
              priority
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
