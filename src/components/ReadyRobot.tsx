import { useEffect, useState } from "react";
import styles from "./ReadyRobot.module.css";

/** Slower than jump — subtle “ready” bob between two transparent frames. */
const FRAME_MS = 380;

const FRAMES = ["/robot-ready/ready_1.png", "/robot-ready/ready_2.png"] as const;

export function ReadyRobot({ className }: { className?: string }) {
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
