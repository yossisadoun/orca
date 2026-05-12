import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Box,
  Calendar,
  Camera,
  CheckCircle2,
  Clipboard,
  Clock,
  Cloud,
  Cog,
  Columns2,
  Command,
  Database,
  FileText,
  Flag,
  Folder,
  Globe,
  Heart,
  Inbox,
  Kanban,
  Layers,
  LayoutTemplate,
  Lightbulb,
  Link2,
  ListFilter,
  Mail,
  MessageSquare,
  MonitorDot,
  Moon,
  Package,
  Plus,
  RefreshCw,
  Rocket,
  Route,
  Search,
  Send,
  Shield,
  Sparkles,
  Star,
  Tag,
  Ticket,
  Trash2,
  User,
  Wrench,
  Zap,
} from "lucide-react";

export interface FeaturesetGroup {
  id: string;
  /** End-user-facing section title (e.g. where in the app this shows up). */
  title: string;
  /** Optional one-line context for the grouping */
  hint?: string;
}

/**
 * User-facing groups in dev order: lists → capture → main list → focus/scheduling.
 * Shipped (~50%) tiles use `defaultFeaturesetItemDefinitions`; planned work uses
 * `plannedFeaturesetItemDefinitions` (board tags only until merged into the catalog).
 */
export const defaultFeaturesetGroups: FeaturesetGroup[] = [
  {
    id: "lists",
    title: "Your lists",
    hint: "Switch lists, header, pin, sync — parallel list plumbing.",
  },
  {
    id: "capture",
    title: "Capture",
    hint: "Get tasks in quickly and share a list link.",
  },
  {
    id: "task-surface",
    title: "Task list",
    hint: "Rows, composer, and list mechanics — decoupled from chrome.",
  },
  {
    id: "focus",
    title: "Focus & schedule",
    hint: "Filters, visibility, dates — own slice of UI + state.",
  },
];

/** Icons available for feature tiles (defaults + custom + extended picker). */
export const featuresetIcons = {
  route: Route,
  link2: Link2,
  barChart3: BarChart3,
  columns2: Columns2,
  plus: Plus,
  star: Star,
  refreshCw: RefreshCw,
  listFilter: ListFilter,
  monitorDot: MonitorDot,
  layoutTemplate: LayoutTemplate,
  kanban: Kanban,
  ticket: Ticket,
  sparkles: Sparkles,
  box: Box,
  zap: Zap,
  bell: Bell,
  calendar: Calendar,
  camera: Camera,
  checkCircle2: CheckCircle2,
  clipboard: Clipboard,
  clock: Clock,
  cloud: Cloud,
  cog: Cog,
  command: Command,
  database: Database,
  fileText: FileText,
  flag: Flag,
  folder: Folder,
  globe: Globe,
  heart: Heart,
  inbox: Inbox,
  layers: Layers,
  lightbulb: Lightbulb,
  mail: Mail,
  messageSquare: MessageSquare,
  moon: Moon,
  package: Package,
  search: Search,
  send: Send,
  shield: Shield,
  tag: Tag,
  trash2: Trash2,
  user: User,
  wrench: Wrench,
  rocket: Rocket,
} as const satisfies Record<string, LucideIcon>;

export type FeaturesetIconKey = keyof typeof featuresetIcons;

export const featuresetIconPickerOptions: { key: FeaturesetIconKey; label: string }[] = [
  { key: "sparkles", label: "Sparkles" },
  { key: "box", label: "Box" },
  { key: "zap", label: "Zap" },
  { key: "route", label: "Path" },
  { key: "link2", label: "Link" },
  { key: "barChart3", label: "Chart" },
  { key: "columns2", label: "Split" },
  { key: "plus", label: "Plus" },
  { key: "star", label: "Star" },
  { key: "refreshCw", label: "Refresh" },
  { key: "listFilter", label: "Filter" },
  { key: "monitorDot", label: "Display" },
  { key: "layoutTemplate", label: "Layout" },
  { key: "kanban", label: "Board" },
  { key: "ticket", label: "Ticket" },
  { key: "bell", label: "Bell" },
  { key: "calendar", label: "Calendar" },
  { key: "camera", label: "Camera" },
  { key: "checkCircle2", label: "Check" },
  { key: "clipboard", label: "Clipboard" },
  { key: "clock", label: "Clock" },
  { key: "cloud", label: "Cloud" },
  { key: "cog", label: "Settings" },
  { key: "command", label: "Command" },
  { key: "database", label: "Database" },
  { key: "fileText", label: "Document" },
  { key: "flag", label: "Flag" },
  { key: "folder", label: "Folder" },
  { key: "globe", label: "Globe" },
  { key: "heart", label: "Heart" },
  { key: "inbox", label: "Inbox" },
  { key: "layers", label: "Layers" },
  { key: "lightbulb", label: "Idea" },
  { key: "mail", label: "Mail" },
  { key: "messageSquare", label: "Message" },
  { key: "moon", label: "Moon" },
  { key: "package", label: "Package" },
  { key: "search", label: "Search" },
  { key: "send", label: "Send" },
  { key: "shield", label: "Shield" },
  { key: "tag", label: "Tag" },
  { key: "trash2", label: "Trash" },
  { key: "user", label: "User" },
  { key: "wrench", label: "Wrench" },
  { key: "rocket", label: "Rocket" },
];

export interface FeaturesetItemDefinition {
  id: string;
  groupId: string;
  label: string;
  description: string;
  iconKey: FeaturesetIconKey;
}

export type FeaturesetItem = Omit<FeaturesetItemDefinition, "iconKey"> & { icon: LucideIcon };

export function resolveFeaturesetItem(def: FeaturesetItemDefinition): FeaturesetItem {
  const { iconKey, ...rest } = def;
  return { ...rest, icon: featuresetIcons[iconKey] };
}

export function getFeaturesetByGroup(
  groups: FeaturesetGroup[],
  items: FeaturesetItem[],
): { group: FeaturesetGroup; items: FeaturesetItem[] }[] {
  const buckets = new Map<string, FeaturesetItem[]>();
  for (const g of groups) {
    buckets.set(g.id, []);
  }
  for (const item of items) {
    buckets.get(item.groupId)?.push(item);
  }
  return groups.map((group) => ({
    group,
    items: buckets.get(group.id) ?? [],
  }));
}

/** Shipped in the mock — ~50% of the v1 todo app; shown as Features tiles (default green). */
export const defaultFeaturesetItemDefinitions: FeaturesetItemDefinition[] = [
  {
    id: "lists-sidebar",
    groupId: "lists",
    label: "List sidebar",
    description:
      "Switch Inbox, Today, and custom lists without losing context — own navigation slice, parallel to task rendering.",
    iconKey: "folder",
  },
  {
    id: "lists-header",
    groupId: "lists",
    label: "List header",
    description:
      "Current list title and breadcrumb-style context so you always know which list you’re in.",
    iconKey: "route",
  },
  {
    id: "lists-pin",
    groupId: "lists",
    label: "Pin list",
    description:
      "Star or pin a list so it stays at the top of the sidebar — independent of sync and task row work.",
    iconKey: "star",
  },
  {
    id: "lists-sync",
    groupId: "lists",
    label: "Sync status",
    description:
      "Manual refresh and last-synced hint so tasks match the server — decoupled from list UI and filters.",
    iconKey: "refreshCw",
  },
  {
    id: "capture-quick-add",
    groupId: "capture",
    label: "Quick add",
    description:
      "Add a task from the header before you pick a list — separate surface from the inline composer row.",
    iconKey: "plus",
  },
  {
    id: "capture-share",
    groupId: "capture",
    label: "Share link",
    description:
      "Copy a URL to this list for yourself or teammates — no dependency on task row or filter implementations.",
    iconKey: "link2",
  },
  {
    id: "task-rows",
    groupId: "task-surface",
    label: "Task rows",
    description:
      "Checkbox, title, and done state per line — the core row component other features attach to.",
    iconKey: "checkCircle2",
  },
  {
    id: "task-composer",
    groupId: "task-surface",
    label: "New-task row",
    description:
      "Expand/collapse chevron and placeholder for typing the next task — parallel track to row chrome.",
    iconKey: "layoutTemplate",
  },
  {
    id: "focus-filter",
    groupId: "focus",
    label: "Status filter",
    description:
      "All / Active / Completed tabs — narrow the list without changing how tasks are stored.",
    iconKey: "listFilter",
  },
  {
    id: "focus-due-dates",
    groupId: "focus",
    label: "Due dates",
    description:
      "Pick due dates and surface overdue styling — isolated from filters and sidebar work.",
    iconKey: "calendar",
  },
];

/** Not yet in the Features grid — tracked on the Control Center board; merge moves them into `customItemDefs`. */
export const plannedFeaturesetItemDefinitions: FeaturesetItemDefinition[] = [
  {
    id: "focus-show-completed",
    groupId: "focus",
    label: "Completed visibility",
    description:
      "Hide finished tasks from the main list while keeping counts accurate — separate from tab filters.",
    iconKey: "monitorDot",
  },
  {
    id: "task-notes",
    groupId: "task-surface",
    label: "Task notes",
    description:
      "Optional description on a task — additive-field work, parallel to tags and reorder.",
    iconKey: "fileText",
  },
  {
    id: "task-tags",
    groupId: "task-surface",
    label: "Tags",
    description:
      "Labels on tasks for lightweight grouping — no dependency on due dates or command palette.",
    iconKey: "tag",
  },
  {
    id: "task-reorder",
    groupId: "task-surface",
    label: "Drag to reorder",
    description:
      "Reorder within a list via drag handle — independent of filters and recurring rules.",
    iconKey: "layers",
  },
  {
    id: "power-command",
    groupId: "capture",
    label: "Command palette",
    description:
      "Cmd-K to jump lists, toggle filters, or add tasks — cross-cutting but ships after core lists exist.",
    iconKey: "command",
  },
  {
    id: "power-recurring",
    groupId: "focus",
    label: "Recurring tasks",
    description:
      "Repeat rules that spawn the next instance — decoupled from reminders and export.",
    iconKey: "clock",
  },
  {
    id: "reminders-ping",
    groupId: "focus",
    label: "Reminders",
    description:
      "Local or push nudges for due tasks — parallel to recurring engine and bulk actions.",
    iconKey: "bell",
  },
  {
    id: "bulk-actions",
    groupId: "task-surface",
    label: "Bulk actions",
    description:
      "Multi-select to complete or delete — orthogonal to drag-reorder and notes.",
    iconKey: "clipboard",
  },
  {
    id: "archive-soft-delete",
    groupId: "lists",
    label: "Archive",
    description:
      "Soft-delete with restore window vs hard delete — list-level semantics, parallel to export.",
    iconKey: "inbox",
  },
  {
    id: "export-list",
    groupId: "capture",
    label: "Export list",
    description:
      "Download this list as JSON or Markdown — standalone from archive and reminders.",
    iconKey: "send",
  },
];
