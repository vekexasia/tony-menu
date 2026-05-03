export interface Palette {
  label: string;
  primary: string;
  primaryLight: string;
  accent: string;
  accentDeep: string;
  accentLight: string;
}

export const PALETTES = {
  terracotta: {
    label: "Terracotta",
    primary: "#cc9166",
    primaryLight: "#f5ebe4",
    accent: "#C47A4F",
    accentDeep: "#A15E35",
    accentLight: "#F4E2D4",
  },
  forest: {
    label: "Forest",
    primary: "#4a7c59",
    primaryLight: "#e6f0e9",
    accent: "#3d6b4a",
    accentDeep: "#2d5038",
    accentLight: "#d4e8da",
  },
  slate: {
    label: "Slate",
    primary: "#4a6480",
    primaryLight: "#e4eaf0",
    accent: "#3d556e",
    accentDeep: "#2d4055",
    accentLight: "#d4dde8",
  },
  aubergine: {
    label: "Aubergine",
    primary: "#7a4a7a",
    primaryLight: "#f0e4f0",
    accent: "#6a3d6a",
    accentDeep: "#502d50",
    accentLight: "#e5d4e5",
  },
  rose: {
    label: "Rose",
    primary: "#b36b7a",
    primaryLight: "#f5e8ea",
    accent: "#9e5a68",
    accentDeep: "#7d4552",
    accentLight: "#f0d9dd",
  },
  charcoal: {
    label: "Charcoal",
    primary: "#555550",
    primaryLight: "#ebebea",
    accent: "#484843",
    accentDeep: "#363631",
    accentLight: "#e2e2e0",
  },
  saffron: {
    label: "Saffron",
    primary: "#c8933a",
    primaryLight: "#f8f0e0",
    accent: "#b07d2a",
    accentDeep: "#8c6018",
    accentLight: "#f5e8cc",
  },
} as const satisfies Record<string, Palette>;

export type PaletteKey = keyof typeof PALETTES;
export const DEFAULT_PALETTE: PaletteKey = "terracotta";

export function applyPalette(key: PaletteKey | string) {
  const p = PALETTES[(key as PaletteKey) in PALETTES ? (key as PaletteKey) : DEFAULT_PALETTE];
  const root = document.documentElement;
  root.style.setProperty("--color-primary", p.primary);
  root.style.setProperty("--color-primary-light", p.primaryLight);
  root.style.setProperty("--color-splash", p.primary);
  root.style.setProperty("--adm-accent", p.accent);
  root.style.setProperty("--adm-accent-deep", p.accentDeep);
  root.style.setProperty("--adm-accent-light", p.accentLight);
}
