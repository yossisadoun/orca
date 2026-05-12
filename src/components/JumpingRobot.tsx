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

function preloadUrls(urls: readonly string[]): Promise<void> {
  return Promise.all(
    urls.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
        }),
    ),
  ).then(() => undefined);
}

/** Looping sprite frames; URLs use BASE_URL so GitHub Pages (/repo/) resolves assets. */
export function JumpingRobot({ className }: { className?: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let id: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    preloadUrls(FRAMES).then(() => {
      if (cancelled) return;
      id = window.setInterval(() => {
        setFrame((f) => (f + 1) % FRAMES.length);
      }, FRAME_MS);
    });

    return () => {
      cancelled = true;
      if (id !== undefined) clearInterval(id);
    };
  }, []);

  return (
    <div className={`${styles.wrap} ${className ?? ""}`} aria-hidden>
      <img
        key={FRAMES[frame]}
        className={styles.frame}
        src={FRAMES[frame]}
        alt=""
        decoding="sync"
        draggable={false}
      />
    </div>
  );
}
