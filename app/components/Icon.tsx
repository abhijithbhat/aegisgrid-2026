import type { SVGProps } from "react";

export type IconName =
  | "grid"
  | "database"
  | "play"
  | "audit"
  | "bell"
  | "search"
  | "shield"
  | "radio"
  | "users"
  | "clock"
  | "sensor"
  | "team"
  | "arrow-up"
  | "arrow-down"
  | "alert"
  | "check"
  | "x"
  | "chevron"
  | "route"
  | "spark"
  | "evidence"
  | "question"
  | "warning"
  | "lock"
  | "language"
  | "edit"
  | "download"
  | "upload"
  | "reset"
  | "pause"
  | "skip"
  | "plus"
  | "file"
  | "trash"
  | "info"
  | "external"
  | "menu"
  | "more"
  | "headset"
  | "map"
  | "filter";

const paths: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
  play: <path d="m8 5 11 7-11 7Z"/>,
  audit: <><path d="M9 5h10v16H5V9Z"/><path d="M9 5v4H5M9 13h6M9 17h6"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  shield: <path d="M12 3 4.5 6v5.5c0 4.7 3.2 8 7.5 9.5 4.3-1.5 7.5-4.8 7.5-9.5V6Z"/>,
  radio: <><circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  sensor: <><path d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0"/><circle cx="12" cy="15" r="2"/></>,
  team: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 11h5M18.5 8.5v5"/></>,
  "arrow-up": <><path d="m7 11 5-5 5 5M12 6v12"/></>,
  "arrow-down": <><path d="m7 13 5 5 5-5M12 18V6"/></>,
  alert: <><path d="M12 3 2.5 20h19Z"/><path d="M12 9v4M12 17h.01"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  x: <><path d="m6 6 12 12M18 6 6 18"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  route: <><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/></>,
  spark: <><path d="m12 3 1.3 4.1L17 9l-3.7 1.9L12 15l-1.3-4.1L7 9l3.7-1.9Z"/><path d="m5 15 .8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8ZM19 3l.6 1.4L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.6Z"/></>,
  evidence: <><path d="M5 3h14v18H5z"/><path d="m8 12 2 2 5-5M8 17h8M8 7h5"/></>,
  question: <><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.4 2.3c-.8.4-1.1.9-1.1 1.7M12 17h.01"/></>,
  warning: <><path d="M12 3 2.5 20h19Z"/><path d="M12 9v4M12 17h.01"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  language: <><path d="M4 5h10M9 3v2M6 9c1.4 2.8 3.8 5 7 6M12 5c-.8 4-3.3 7.5-7 9"/><path d="m15 13 3 8M21 13l-3 8M16 18h4"/></>,
  edit: <><path d="m14 4 6 6L9 21H3v-6Z"/><path d="m12 6 6 6"/></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></>,
  reset: <><path d="M4 7v5h5"/><path d="M5.5 16a8 8 0 1 0 .5-9l-2 5"/></>,
  pause: <><path d="M9 5v14M15 5v14"/></>,
  skip: <><path d="m5 5 10 7L5 19ZM19 5v14"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  file: <><path d="M6 2h8l4 4v16H6Z"/><path d="M14 2v5h4M9 13h6M9 17h6"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v7H4V6h7"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  headset: <><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h4v6H6a2 2 0 0 1-2-2ZM20 14h-4v6h2a2 2 0 0 0 2-2ZM16 20c0 1-1 2-3 2"/></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/></>,
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8Z"/>,
};

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
