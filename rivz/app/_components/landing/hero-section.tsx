"use client";
import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";

const words = [
  { text: "Think", muted: false },
  { text: "less.", muted: true },
  { text: "Do", muted: false },
  { text: "more.", muted: false },
];

const angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const waves = [0, 1, 2];

export function HeroSection() {
  const reduce = useReducedMotion();

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
              className="flex items-center gap-5 flex-shrink-0"
            >
              <Link
                href="/signup"
                className="bg-white text-black font-semibold px-7 py-3.5 rounded-full hover:bg-zinc-100 transition-all duration-200 active:scale-[0.97] text-sm whitespace-nowrap"
              >
                Start free
              </Link>
              <Link
                href="/login"
                className="text-zinc-500 hover:text-white text-sm transition-colors duration-200 whitespace-nowrap"
              >
                Sign in
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Right Column: Logo with Reverberating Dots Animation */}
        <div className="relative flex-shrink-0 w-full max-w-[380px] sm:max-w-[450px] aspect-square flex items-center justify-center select-none overflow-visible">
          {/* Pulsing Background Glow */}
          <motion.div
            animate={{
              scale: [0.9, 1.1, 0.9],
              opacity: [0.15, 0.28, 0.15],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute size-[240px] rounded-full bg-white/5 blur-3xl"
          />

          {/* Concentric waves and radiating dots */}
          {!reduce &&
            waves.map((waveIndex) => {
              const delay = waveIndex * 1.3;
              return (
                <div key={waveIndex} className="absolute inset-0 flex items-center justify-center">
                  {/* Expanding Dashed Ring */}
                  <motion.div
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{
                      scale: [0.4, 1.6, 2.6],
                      opacity: [0, 0.35, 0],
                    }}
                    transition={{
                      duration: 3.9,
                      repeat: Infinity,
                      delay: delay,
                      ease: "easeOut",
                    }}
                    className="absolute size-[160px] rounded-full border border-dashed border-white/20 pointer-events-none"
                  />

                  {/* Radiating Angle Dots */}
                  {angles.map((angle) => {
                    const x = Math.cos((angle * Math.PI) / 180);
                    const y = Math.sin((angle * Math.PI) / 180);
                    return (
                      <motion.div
                        key={angle}
                        initial={{ x: x * 50, y: y * 50, opacity: 0, scale: 0.4 }}
                        animate={{
                          x: x * 210,
                          y: y * 210,
                          opacity: [0, 0.7, 0.7, 0],
                          scale: [0.4, 0.9, 0.6, 0.2],
                        }}
                        transition={{
                          duration: 3.9,
                          repeat: Infinity,
                          delay: delay,
                          ease: "easeOut",
                        }}
                        className="absolute size-2 rounded-full bg-white/40 shadow-[0_0_6px_rgba(255,255,255,0.4)] pointer-events-none"
                      />
                    );
                  })}
                </div>
              );
            })}

          {/* Floating Logo Container */}
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.8 }}
            animate={
              reduce
                ? { y: [-6, 6, -6] }
                : {
                    opacity: 1,
                    scale: 1,
                    y: [-8, 8, -8],
                  }
            }
            transition={{
              opacity: { duration: 0.6, ease: "easeOut" },
              scale: { duration: 0.6, ease: "easeOut" },
              y: {
                duration: 6,
                repeat: Infinity,
                ease: "easeInOut",
              },
            }}
            className="relative z-10 size-36 sm:size-44 rounded-[2.5rem] bg-zinc-950/80 border border-white/10 p-5 shadow-[0_0_50px_rgba(0,0,0,0.8),_0_0_30px_rgba(255,255,255,0.03)] flex items-center justify-center backdrop-blur-xl"
          >
            <Image
              src="/logo.png"
              alt="Fayde Logo"
              width={176}
              height={176}
              className="size-full object-contain rounded-[1.8rem] select-none"
              priority
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
