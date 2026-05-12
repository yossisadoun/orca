import { useEffect, useState } from "react";
import styles from "./JumpingRobot.module.css";

const FRAME_MS = 100;

const FRAMES = [
  "/robot-jump/jump_1.png",
  "/robot-jump/jump_2.png",
  "/robot-jump/jump_3.png",
  "/robot-jump/jump_4.png",
  "/robot-jump/jump_5.png",
  "/robot-jump/jump_6.png",
] as const;

/** Looping frame animation — artwork uses a dark matte; keep on dark chip for correct colors. */
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
