import type { BoardColumn } from "../types";

type HeaderVariant = BoardColumn["headerVariant"];

export function ColumnHeaderIcon({ variant }: { variant: HeaderVariant }) {
  const size = 14;
  switch (variant) {
    case "empty":
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
          <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </svg>
      );
    case "progress":
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
          <circle cx="7" cy="7" r="5.25" fill="none" stroke="#E8B84A" strokeWidth="1.25" />
          <path
            d="M7 1.75 A5.25 5.25 0 0 1 12.25 7 L7 7 Z"
            fill="#E8B84A"
            stroke="none"
          />
        </svg>
      );
    case "review":
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
          <circle cx="7" cy="7" r="5.25" fill="#F5C4C4" stroke="#E08585" strokeWidth="1.1" />
          <path
            d="M4 10 L10 4"
            stroke="#C45C5C"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>
      );
    case "merge":
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
          <circle cx="3.75" cy="4" r="1.85" fill="#BBF7D0" stroke="#16A34A" strokeWidth="1.1" />
          <circle cx="3.75" cy="10" r="1.85" fill="#BBF7D0" stroke="#16A34A" strokeWidth="1.1" />
          <path
            d="M5.6 4H8.5c1.1 0 2 .9 2 2v.1M5.6 10H8.5c1.1 0 2-.9 2-2v-.1"
            fill="none"
            stroke="#15803D"
            strokeWidth="1.15"
            strokeLinecap="round"
          />
          <circle cx="10.25" cy="7" r="2" fill="#DCFCE7" stroke="#16A34A" strokeWidth="1.1" />
        </svg>
      );
  }
}

export function IconLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8.5 6.5h-1a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7.5 9.5h1a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2h-1a2 2 0 0 0-2 2v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconDots() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="3.5" cy="7" r="1" fill="currentColor" />
      <circle cx="7" cy="7" r="1" fill="currentColor" />
      <circle cx="10.5" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}
