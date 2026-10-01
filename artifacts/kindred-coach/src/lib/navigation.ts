import { canonicalPathname, LEGACY_PRIMARY_ROUTE_REDIRECTS } from "./routing";
export { LEGACY_PRIMARY_ROUTE_REDIRECTS } from "./routing";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  MessageCircle,
  BarChart3,
  User,
  Sunrise,
  ScanLine,
  Sunset,
  ListTodo,
  Pill,
  Bell,
  UserRoundCog,
  Archive as ArchiveIcon,
} from "lucide-react";

/**
 * Signed-in application navigation model.
 *
 * The signed-in product organises its active routes under four *primary
 * destinations* (Today, Talk, Insights, You). Lower-frequency routes remain
 * reachable but are presented as secondary items rather than a flat 13-item
 * list.
 *
 * The four primary destinations use the canonical Phase 2C URLs. Legacy
 * primary URLs remain redirect aliases in App.tsx so existing bookmarks keep
 * working without appearing as duplicate navigation destinations.
 */

export type PrimaryArea = "today" | "talk" | "insights" | "you";

export interface NavigationItem {
  /** Route href as currently served (relative to the site router). */
  href: string;
  /** Display label. */
  label: string;
  icon: LucideIcon;
}

export interface PrimaryDestination extends NavigationItem {
  /** Stable area key used for active-state grouping and aria labels. */
  area: PrimaryArea;
}

/** The four primary destinations shown in the desktop sidebar and mobile tab bar. */
export const PRIMARY_DESTINATIONS: PrimaryDestination[] = [
  { area: "today", href: "/today", label: "Today", icon: Home },
  { area: "talk", href: "/talk", label: "Talk", icon: MessageCircle },
  { area: "insights", href: "/insights", label: "Insights", icon: BarChart3 },
  { area: "you", href: "/you", label: "You", icon: User },
];

/** Lower-frequency routes, surfaced via the secondary navigation. */
export const SECONDARY_NAV_ITEMS: NavigationItem[] = [
  { href: "/app/morning", label: "Morning", icon: Sunrise },
  { href: "/app/scans", label: "Scans", icon: ScanLine },
  { href: "/app/evening", label: "Evening", icon: Sunset },
  { href: "/app/habits", label: "Habits", icon: ListTodo },
  { href: "/app/medications", label: "Medications", icon: Pill },
  { href: "/app/reminders", label: "Reminders", icon: Bell },
  { href: "/app/account", label: "Account security", icon: UserRoundCog },
  { href: "/app/archive", label: "Archive", icon: ArchiveIcon },
];

/**
 * Maps every canonical and secondary route to the primary area
 * it belongs to. Alias lookup happens in primaryAreaForPath.
 */
export const ROUTE_TO_PRIMARY_AREA: Record<string, PrimaryArea> = {
  "/today": "today",
  "/app/morning": "today",
  "/app/scans": "today",
  "/app/evening": "today",
  "/app/habits": "today",
  "/app/medications": "today",
  "/app/reminders": "today",
  "/talk": "talk",
  "/app/archive": "talk",
  "/insights": "insights",
  "/you": "you",
  "/app/account": "you",
};

/** Returns the primary area for a location path (falls back to `null`). */
export function primaryAreaForPath(location: string): PrimaryArea | null {
  const path = canonicalPathname(location.split(/[?#]/, 1)[0]);
  return (
    ROUTE_TO_PRIMARY_AREA[LEGACY_PRIMARY_ROUTE_REDIRECTS[path] ?? path] ?? null
  );
}

/** Every destination presented to a signed-in member, exactly once. */
export const ALL_SIGNED_IN_ROUTES: string[] = [
  ...PRIMARY_DESTINATIONS.map((destination) => destination.href),
  ...SECONDARY_NAV_ITEMS.map((item) => item.href),
];

function bucketSecondaryRoutesByArea(): Record<PrimaryArea, NavigationItem[]> {
  const buckets: Record<PrimaryArea, NavigationItem[]> = {
    today: [],
    talk: [],
    insights: [],
    you: [],
  };
  for (const item of SECONDARY_NAV_ITEMS) {
    const area = ROUTE_TO_PRIMARY_AREA[item.href];
    if (area) buckets[area].push(item);
  }
  return buckets;
}

/**
 * Secondary routes bucketed by the primary area they belong to (derived from
 * the same model that drives the navigation shell). Insights currently has no
 * secondary routes; Talk has Archive; You has Account security.
 */
export const AREA_SECONDARY_ROUTES: Record<PrimaryArea, NavigationItem[]> =
  bucketSecondaryRoutesByArea();

/**
 * The secondary destinations of a primary area, optionally excluding the page
 * the visitor is already on. Primary-area pages use this to surface the rest
 * of their area without duplicating the navigation model.
 */
export function areaSecondaryDestinations(
  area: PrimaryArea,
  opts: { excludeHref?: string } = {},
): NavigationItem[] {
  return AREA_SECONDARY_ROUTES[area].filter(
    (item) => item.href !== opts?.excludeHref,
  );
}

/** The primary destination that anchors an area (e.g. Talk → /talk). */
export function areaPrimaryDestination(area: PrimaryArea): PrimaryDestination {
  const destination = PRIMARY_DESTINATIONS.find((d) => d.area === area);
  if (!destination) {
    throw new Error(`No primary destination for area: ${area}`);
  }
  return destination;
}
