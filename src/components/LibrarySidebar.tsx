import type { CSSProperties } from "react";
import { ListMusic, PanelLeftClose, PanelLeftOpen, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLocaleLabel, locales, type Locale } from "@/i18n";
import type { TFunction, ThemeName } from "@/types/app";
import { themeOptions } from "@/types/app";
import type { useRemoteAccess } from "@/lib/useRemoteAccess";
import { RemoteAccessControls } from "./RemoteAccessControls";

type LibrarySidebarProps = {
  displayedLibraryPath: string;
  isLibraryMenuOpen: boolean;
  isSidebarCollapsed: boolean;
  isTauriRuntime: boolean;
  locale: Locale;
  onLibraryMenuOpenChange: (isOpen: boolean | ((isOpen: boolean) => boolean)) => void;
  onLocaleChange: (locale: Locale) => void;
  onOpenLibrarySettings: () => void;
  onSidebarCollapsedChange: (isCollapsed: boolean | ((isCollapsed: boolean) => boolean)) => void;
  onThemeNameChange: (themeName: ThemeName) => void;
  remoteAccess: ReturnType<typeof useRemoteAccess>;
  t: TFunction;
  themeName: ThemeName;
};

export function LibrarySidebar({
  displayedLibraryPath,
  isLibraryMenuOpen,
  isSidebarCollapsed,
  isTauriRuntime,
  locale,
  onLibraryMenuOpenChange,
  onLocaleChange,
  onOpenLibrarySettings,
  onSidebarCollapsedChange,
  onThemeNameChange,
  remoteAccess,
  t,
  themeName,
}: LibrarySidebarProps) {
  return (
    <section className="library-panel" aria-label={t("library.controls")}>
      <div className="sidebar-header">
        <p className="eyebrow">{t("app.brand")}</p>
        <Button
          aria-label={isSidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          aria-pressed={isSidebarCollapsed}
          className="sidebar-collapse-button"
          onClick={() => onSidebarCollapsedChange((value) => !value)}
          title={isSidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          type="button"
          variant="outline"
        >
          {isSidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
        <Button
          aria-expanded={isLibraryMenuOpen}
          className="sidebar-toggle"
          onClick={() => onLibraryMenuOpenChange((value) => !value)}
          type="button"
          variant="outline"
        >
          <ListMusic />
          <span>{t("library.controls")}</span>
        </Button>
      </div>

      <div className="library-menu-content" data-open={isLibraryMenuOpen}>
        <div className="top-row">
          <div className="settings-row">
            <label className="language-field">
              <span>{t("language.label")}</span>
              <Select value={locale} onValueChange={(value) => onLocaleChange(value as Locale)}>
                <SelectTrigger aria-label={t("language.label")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locales.map((availableLocale) => (
                    <SelectItem key={availableLocale} value={availableLocale}>
                      {getLocaleLabel(availableLocale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="language-field">
              <span>{t("theme.label")}</span>
              <Select value={themeName} onValueChange={(value) => onThemeNameChange(value as ThemeName)}>
                <SelectTrigger aria-label={t("theme.label")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {themeOptions.map((theme) => (
                    <SelectItem key={theme.name} value={theme.name}>
                      <span className="theme-option">
                        <span
                          aria-hidden="true"
                          className="theme-swatch"
                          style={{ "--theme-swatch": theme.color } as CSSProperties}
                        />
                        <span>{t(theme.labelKey)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>

        <Button
          aria-label={t("scan.openLibrarySettings")}
          className="library-path-button"
          disabled={!isTauriRuntime}
          onClick={onOpenLibrarySettings}
          type="button"
          variant="outline"
        >
          <span className="library-path-copy">
            <span>{t("scan.folderLabel")}</span>
            <strong>{displayedLibraryPath}</strong>
          </span>
          <Settings2 aria-hidden="true" />
        </Button>

        <RemoteAccessControls
          isLocalDevEnabled={remoteAccess.isLocalDevEnabled}
          isPublicDevApiAvailable={remoteAccess.isPublicDevApiAvailable}
          isPublicDevEnabled={remoteAccess.isPublicDevEnabled}
          isPublicDevStarting={remoteAccess.isPublicDevStarting}
          isTauriRuntime={isTauriRuntime}
          localDevError={remoteAccess.localDevError}
          localDevQrDataUrl={remoteAccess.localDevQrDataUrl}
          localDevUrl={remoteAccess.localDevUrl}
          onRemoteAccessModeChange={(mode) => void remoteAccess.setRemoteAccessMode(mode)}
          publicDevError={remoteAccess.publicDevError}
          publicDevQrDataUrl={remoteAccess.publicDevQrDataUrl}
          publicDevUrl={remoteAccess.publicDevUrl}
          remoteAccessMode={remoteAccess.remoteAccessMode}
          t={t}
        />
      </div>
    </section>
  );
}
