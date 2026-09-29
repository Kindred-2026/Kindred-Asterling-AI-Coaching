import { Link, useLocation } from "wouter";
import {
  LogOut,
  Palette,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logoMark from "@/assets/brand/logo-mark.png";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { format, parseISO } from "date-fns";
import { useTheme, THEME_OPTIONS, type ThemeName } from "@/hooks/use-theme";
import {
  getGetCurrentAuthUserQueryKey,
  type AuthUser,
  useGetCurrentAuthUser,
} from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useQueryClient } from "@tanstack/react-query";
import {
  type NavigationItem,
  PRIMARY_DESTINATIONS,
  SECONDARY_NAV_ITEMS,
  primaryAreaForPath,
} from "@/lib/navigation";

const SIDEBAR_STORAGE_KEY = "kindred:sidebar-collapsed";

function useSidebarCollapsed(): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);
  return [collapsed, setCollapsed];
}

function ThemePicker({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme } = useTheme();
  const current = THEME_OPTIONS.find((t) => t.value === theme);

  const trigger = (
    <button
      className={cn(
        "flex items-center rounded-lg transition-colors text-sm font-medium w-full text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        collapsed ? "justify-center p-2" : "gap-3 px-3 py-2.5",
      )}
      data-testid="theme-picker-trigger"
      aria-label="Change theme"
    >
      <Palette
        className="w-5 h-5 text-muted-foreground shrink-0"
        strokeWidth={2}
      />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">Theme</span>
          <span className="flex gap-1">
            {current?.swatches.map((c) => (
              <span
                key={c}
                className="w-3 h-3 rounded-full border border-border"
                style={{ backgroundColor: c }}
              />
            ))}
          </span>
        </>
      )}
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right">Theme</TooltipContent>
          </Tooltip>
        ) : (
          trigger
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" className="w-56">
        <DropdownMenuLabel>Color theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEME_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => setTheme(opt.value as ThemeName)}
            className="flex items-center gap-3 cursor-pointer"
            data-testid={`theme-option-${opt.value}`}
          >
            <span className="flex gap-1">
              {opt.swatches.map((c) => (
                <span
                  key={c}
                  className="w-3 h-3 rounded-full border border-border"
                  style={{ backgroundColor: c }}
                />
              ))}
            </span>
            <span className="flex-1">{opt.label}</span>
            {theme === opt.value && <Check className="w-4 h-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfilePanel({
  user,
  collapsed,
}: {
  user: AuthUser | null;
  collapsed: boolean;
}) {
  if (!user) return null;
  const name = user.preferredName || user.firstName || user.email || "You";
  const initials = (name.match(/\b\w/g) ?? [])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex justify-center p-2">
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-semibold">
              {initials || "·"}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">{name}</TooltipContent>
      </Tooltip>
    );
  }

  const fields: { label: string; value: string | null | undefined }[] = [
    {
      label: "Birthday",
      value: user.birthday ? safeFormatDate(user.birthday) : null,
    },
    { label: "Working on", value: user.struggles },
    { label: "Strengths", value: user.strengths },
    { label: "Interests", value: user.interests },
  ];
  return (
    <div className="px-3 pb-3 pt-2">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
          {initials || "·"}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{name}</p>
          {user.email && (
            <p className="text-[11px] text-muted-foreground truncate">
              {user.email}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-1.5 mt-3">
        {fields.map((f) => (
          <div key={f.label} className="text-[11px]">
            <span className="text-muted-foreground/80 uppercase tracking-wide">
              {f.label}
            </span>
            <p
              className={cn(
                "text-foreground/90 leading-snug",
                !f.value && "text-muted-foreground/50 italic",
              )}
            >
              {f.value || "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function safeFormatDate(s: string): string {
  try {
    return format(parseISO(s), "PP");
  } catch {
    return s;
  }
}

function DesktopNavLink({
  href,
  label,
  isActive,
  collapsed,
  icon,
  testId,
}: {
  href: string;
  label: string;
  isActive: boolean;
  collapsed: boolean;
  icon: NavigationItem["icon"];
  testId?: string;
}) {
  const Icon = icon;
  const link = (
    <Link
      href={href}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center rounded-lg transition-colors text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-sidebar-foreground hover:bg-sidebar-accent",
      )}
      data-testid={testId}
    >
      <Icon
        className={cn(
          "w-5 h-5 shrink-0",
          isActive ? "text-primary" : "text-muted-foreground",
        )}
        strokeWidth={isActive ? 2.5 : 2}
      />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function MobileTabLink({
  href,
  label,
  isActive,
  icon: Icon,
}: {
  href: string;
  label: string;
  isActive: boolean;
  icon: NavigationItem["icon"];
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon
        className="h-5 w-5 shrink-0"
        strokeWidth={isActive ? 2.5 : 2}
      />
      <span>{label}</span>
    </Link>
  );
}

function SecondaryNavList({
  items,
  activeHref,
  onNavigate,
}: {
  items: NavigationItem[];
  activeHref: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const isActive = item.href === activeHref;
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const { data: authData } = useGetCurrentAuthUser({
    query: { queryKey: getGetCurrentAuthUserQueryKey() },
  });
  const user = authData?.user ?? null;
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const previousLocation = useRef(location);
  const navigatingFromSheet = useRef(false);

  useEffect(() => {
    if (previousLocation.current === location) return;
    previousLocation.current = location;
    mainRef.current?.scrollTo?.(0, 0);
    mainRef.current?.focus();
  }, [location]);

  const logout = useCallback(async () => {
    queryClient.clear();
    await signOut();
  }, [queryClient, signOut]);

  const activeArea = primaryAreaForPath(location);

  return (
    <div className="signed-in-shell flex h-screen h-dvh bg-background text-foreground overflow-hidden">
      <a href="#main-content" className="skip-link" onClick={(event) => {
        event.preventDefault();
        mainRef.current?.focus();
      }}>Skip to main content</a>
      {/* Desktop sidebar (hidden on small screens). */}
      <aside
        aria-label="Primary navigation"
        className={cn(
          "hidden md:flex shrink-0 overflow-y-auto flex-col border-r bg-sidebar border-border transition-[width] duration-200 ease-in-out motion-reduce:transition-none",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {/* Brand + collapse toggle */}
        <div
          className={cn(
            "flex items-center justify-between shrink-0",
            collapsed ? "p-3 flex-col gap-2" : "p-6",
          )}
        >
          {!collapsed ? (
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={logoMark}
                alt="Kindred Asterling"
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
              <div className="min-w-0">
                <p className="text-lg font-serif text-primary tracking-tight font-medium leading-tight truncate">
                  Kindred Asterling
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 tracking-wide">
                  AI Coaching
                </p>
              </div>
            </div>
          ) : (
            <img
              src={logoMark}
              alt="Kindred Asterling"
              className="w-9 h-9 rounded-full object-cover"
            />
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="sidebar-toggle"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
              >
                {collapsed ? (
                  <PanelLeftOpen className="w-5 h-5" strokeWidth={2} />
                ) : (
                  <PanelLeftClose className="w-5 h-5" strokeWidth={2} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Primary destinations */}
        <nav
          aria-label="Primary destinations"
          className={cn("mt-2 shrink-0", collapsed ? "px-2" : "px-4")}
        >
          <ul className="space-y-1.5">
            {PRIMARY_DESTINATIONS.map((item) => (
              <li key={item.area}>
                <DesktopNavLink
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  isActive={item.area === activeArea}
                  collapsed={collapsed}
                  testId={`nav-primary-${item.area}`}
                />
              </li>
            ))}
          </ul>
        </nav>

        {/* Scroll-safe secondary destinations */}
        <nav
          aria-label="All destinations"
          className={cn(
            "shrink-0 mt-2 pb-2",
            collapsed ? "px-2" : "px-4",
          )}
        >
          {!collapsed && (
            <p className="px-3 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              More
            </p>
          )}
          <ul className="space-y-1.5">
            {SECONDARY_NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <DesktopNavLink
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  isActive={location === item.href}
                  collapsed={collapsed}
                />
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer: profile, theme, logout */}
        <div
          className={cn(
            "shrink-0 border-t border-border space-y-1",
            collapsed ? "p-2" : "p-4",
          )}
        >
          <ProfilePanel user={user} collapsed={collapsed} />
          <ThemePicker collapsed={collapsed} />
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={logout}
                  className="flex items-center justify-center p-2 rounded-lg transition-colors text-sm font-medium w-full text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="logout"
                  aria-label="Log out"
                >
                  <LogOut
                    className="w-5 h-5 text-muted-foreground"
                    strokeWidth={2}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Log out</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={logout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium w-full text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="logout"
            >
              <LogOut
                className="w-5 h-5 text-muted-foreground"
                strokeWidth={2}
              />
              Log out
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main id="main-content" ref={mainRef} tabIndex={-1} aria-label="Main content" className="min-w-0 flex-1 overflow-y-auto relative">
        <div className="mx-auto max-w-2xl p-4 md:p-8 min-h-full pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom navigation (small screens only). */}
      <nav
        aria-label="Primary navigation"
        className={cn(
          "md:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-background/95 backdrop-blur-md",
          "pb-[env(safe-area-inset-bottom)]",
        )}
      >
        {PRIMARY_DESTINATIONS.map((item) => (
          <MobileTabLink
            key={item.area}
            href={item.href}
            label={item.label}
            icon={item.icon}
            isActive={item.area === activeArea}
          />
        ))}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "text-muted-foreground hover:text-foreground",
              )}
              data-testid="mobile-more-trigger"
              aria-label="More destinations"
            >
              <MoreHorizontal className="h-5 w-5 shrink-0" strokeWidth={2} />
              <span>More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="signed-in-sheet max-h-[85dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]" onCloseAutoFocus={(event) => {
            if (navigatingFromSheet.current) {
              event.preventDefault();
              navigatingFromSheet.current = false;
              mainRef.current?.focus();
            }
          }}>
            <SheetHeader className="text-left">
              <SheetTitle>More destinations</SheetTitle>
              <SheetDescription>
                Everything else in Kindred, one tap away.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-6">
              <SecondaryNavList
                items={SECONDARY_NAV_ITEMS}
                activeHref={location}
                onNavigate={() => { navigatingFromSheet.current = true; setMoreOpen(false); }}
              />
              <div className="border-t border-border pt-4 flex flex-col gap-2">
                <ProfilePanel user={user} collapsed={false} />
                <div className="px-1">
                  <ThemePicker collapsed={false} />
                </div>
                <button
                  onClick={logout}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="logout-mobile"
                >
                  <LogOut
                    className="w-5 h-5 text-muted-foreground"
                    strokeWidth={2}
                  />
                  Log out
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}
