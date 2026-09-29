import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

export type ThemeName =
  | "nightfall"
  | "quiet-sage"
  | "deep-tide"
  | "warm-ember"
  | "lavender-dusk"
  | "midnight-bloom";

const STORAGE_KEY = "kindred-theme";
const THEME_CLASSES: Record<ThemeName, string> = {
  nightfall: "theme-nightfall",
  "quiet-sage": "theme-quiet-sage",
  "deep-tide": "theme-deep-tide",
  "warm-ember": "theme-warm-ember",
  "lavender-dusk": "theme-lavender-dusk",
  "midnight-bloom": "theme-midnight-bloom",
};

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemeName {
  if (typeof window === "undefined") return "nightfall";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && Object.hasOwn(THEME_CLASSES, stored))
    return stored as ThemeName;
  return "nightfall";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => readStoredTheme());

  useEffect(() => {
    const root = document.documentElement;
    Object.values(THEME_CLASSES).forEach((cls) => root.classList.remove(cls));
    root.classList.add(THEME_CLASSES[theme]);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

export const THEME_OPTIONS: {
  value: ThemeName;
  label: string;
  swatches: string[];
}[] = [
  {
    value: "nightfall",
    label: "Nightfall",
    swatches: ["#0e0c18", "#6986fc", "#ff8b3d"],
  },
  {
    value: "quiet-sage",
    label: "Quiet Sage",
    swatches: ["#f4f0e6", "#173a34", "#dcae78"],
  },
  {
    value: "deep-tide",
    label: "Deep Tide",
    swatches: ["#081b24", "#55c5bd", "#e7b877"],
  },
  {
    value: "warm-ember",
    label: "Warm Ember",
    swatches: ["#fff4e8", "#863b2c", "#e29a52"],
  },
  {
    value: "lavender-dusk",
    label: "Lavender Dusk",
    swatches: ["#f4f0fa", "#51436f", "#885298"],
  },
  {
    value: "midnight-bloom",
    label: "Midnight Bloom",
    swatches: ["#151222", "#da9fba", "#8eb9a6"],
  },
];
