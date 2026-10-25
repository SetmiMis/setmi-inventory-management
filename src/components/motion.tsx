"use client";

import { animate, motion, MotionConfig, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

// Small, calm animations for the dashboard and home page (library: Motion, MIT).
// Everything respects the computer's "reduce motion" setting: then content simply appears.

// Wrap a group: its <RevealItem> children slide up one after another.
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

export function RevealItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } } }}
    >
      {children}
    </motion.div>
  );
}

// A number that counts up to its value once it is on screen.
export function CountUp({ value, money = false, decimals = 0 }: { value: number; money?: boolean; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const fmt = (n: number) =>
    (money ? "₹" : "") +
    n.toLocaleString("en-IN", { minimumFractionDigits: money ? 2 : decimals, maximumFractionDigits: money ? 2 : decimals });
  const [shown, setShown] = useState(() => fmt(0));

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, value, { duration: 0.8, ease: "easeOut", onUpdate: (v) => setShown(fmt(v)) });
    return () => controls.stop();
    // fmt depends only on props already listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, reduce, money, decimals]);

  // With "reduce motion" the final number is shown straight away.
  return <span ref={ref}>{reduce ? fmt(value) : shown}</span>;
}
