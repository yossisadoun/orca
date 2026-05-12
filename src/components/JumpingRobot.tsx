import { useEffect, useState } from "react";
import styles from "./JumpingRobot.module.css";

const FRAME_MS = 100;

const base = import.meta.env.BASE_URL;

const FRAMES = [
  `${base}robot-jump/jump_1.png`,
  `${base}robot-jump/jump_2.png`,
  `${base}robot-jump/jump_3.png`,
  `${base}robot-jump/jump_4.png`,
  `${base}robot-jump/jump_5.png`,
  `${base}robot-jump/jump_6.png`,
] as const;

/** Looping sprite frames; URLs use BASE_URL so GitHub Pages (/repo/) resolves assets. */
export function JumpingRobot({ className }: { className?: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, FRAME_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`${styles.wrap} ${className ?? ""}`} aria-hidden>
      <img
        className={styles.frame}
        src={FRAMES[frame]}
        alt=""
        decoding="async"
        draggable={false}
      />
    </div>
  );
}
