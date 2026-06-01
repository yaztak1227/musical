import { type TranslationKey } from "../i18n";

export type I18nMessage = {
  key: TranslationKey;
  values?: Record<string, string | number>;
};

export type TFunction = (key: TranslationKey, values?: Record<string, string | number>) => string;

export type RepeatMode = "off" | "all" | "one";
export type AlbumViewMode = "large" | "small" | "list";
export type AlbumListMode = "album" | "track";
export type AlbumSortMode = "title" | "artist" | "year";
export type AlbumSortDirection = "asc" | "desc";
export type ThemeName = "crimson" | "ocean" | "violet" | "forest" | "amber" | "mono";

export const themeOptions = [
  { name: "crimson", labelKey: "theme.crimson", color: "oklch(0.46 0.18 25)" },
  { name: "ocean", labelKey: "theme.ocean", color: "oklch(0.46 0.12 205)" },
  { name: "violet", labelKey: "theme.violet", color: "oklch(0.48 0.18 292)" },
  { name: "forest", labelKey: "theme.forest", color: "oklch(0.43 0.12 145)" },
  { name: "amber", labelKey: "theme.amber", color: "oklch(0.58 0.15 72)" },
  { name: "mono", labelKey: "theme.mono", color: "oklch(0.34 0.01 260)" },
] satisfies { name: ThemeName; labelKey: TranslationKey; color: string }[];

export function isThemeName(value: string | null): value is ThemeName {
  return themeOptions.some((theme) => theme.name === value);
}
