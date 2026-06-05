import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, FolderCog, ListMusic, Palette, PanelLeftClose, PanelLeftOpen, Settings2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLocaleLabel, locales, type Locale } from "@/i18n";
import type { I18nMessage, TFunction, ThemeName } from "@/types/app";
import { themeOptions } from "@/types/app";
import type { useRemoteAccess } from "@/lib/useRemoteAccess";
import { RemoteAccessControls } from "./RemoteAccessControls";

export type LibrarySidebarSection = "appearance" | "settings" | "remote";

export type LibrarySidebarSectionState = Record<LibrarySidebarSection, boolean>;

type LibrarySidebarProps = {
  displayedLibraryPath: string;
  isCheckingForUpdate: boolean;
  isLibraryMenuOpen: boolean;
  isMcpEnabled: boolean;
  isSidebarCollapsed: boolean;
  isTauriRuntime: boolean;
  locale: Locale;
  mcpError: string | null;
  mcpUrl: string | null;
  updateInfo: I18nMessage | null;
  onCheckForUpdate: () => void;
  onLibraryMenuOpenChange: (isOpen: boolean | ((isOpen: boolean) => boolean)) => void;
  onLocaleChange: (locale: Locale) => void;
  onMcpEnabledChange: (enabled: boolean) => void;
  onOpenLibrarySettings: () => void;
  onSectionOpenChange: (section: LibrarySidebarSection, isOpen: boolean) => void;
  onSidebarCollapsedChange: (isCollapsed: boolean | ((isCollapsed: boolean) => boolean)) => void;
  onThemeNameChange: (themeName: ThemeName) => void;
  remoteAccess: ReturnType<typeof useRemoteAccess>;
  sectionOpenState: LibrarySidebarSectionState;
  t: TFunction;
  themeName: ThemeName;
};

export function LibrarySidebar({
  displayedLibraryPath,
  isCheckingForUpdate,
  isLibraryMenuOpen,
  isMcpEnabled,
  isSidebarCollapsed,
  isTauriRuntime,
  locale,
  mcpError,
  mcpUrl,
  updateInfo,
  onCheckForUpdate,
  onLibraryMenuOpenChange,
  onLocaleChange,
  onMcpEnabledChange,
  onOpenLibrarySettings,
  onSectionOpenChange,
  onSidebarCollapsedChange,
  onThemeNameChange,
  remoteAccess,
  sectionOpenState,
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
        <SidebarSection
          icon={<Palette />}
          isOpen={sectionOpenState.appearance}
          label={t("sidebar.section.appearance")}
          onOpenChange={(isOpen) => onSectionOpenChange("appearance", isOpen)}
        >
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
        </SidebarSection>

        <SidebarSection
          icon={<FolderCog />}
          isOpen={sectionOpenState.settings}
          label={t("sidebar.section.settings")}
          onOpenChange={(isOpen) => onSectionOpenChange("settings", isOpen)}
        >
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

          <div className="settings-action-row">
            <div>
              <p className="eyebrow">{t("updates.label")}</p>
              {updateInfo ? (
                <p className="info-text" aria-live="polite">
                  {t(updateInfo.key, updateInfo.values)}
                </p>
              ) : null}
            </div>
            <Button
              disabled={isCheckingForUpdate || !isTauriRuntime}
              onClick={onCheckForUpdate}
              title={!isTauriRuntime ? t("updates.desktopOnly") : undefined}
              type="button"
              variant="outline"
            >
              {isCheckingForUpdate ? t("updates.checking") : t("updates.check")}
            </Button>
          </div>

          {isTauriRuntime ? (
            <div className="settings-action-row">
              <label className="mcp-setting">
                <input
                  checked={isMcpEnabled}
                  onChange={(event) => onMcpEnabledChange(event.currentTarget.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>{t("mcp.label")}</strong>
                  <span>{t("mcp.description")}</span>
                </span>
              </label>
              <div className="mcp-status" aria-live="polite">
                {mcpError ? (
                  <p className="info-text">{t("mcp.error", { message: mcpError })}</p>
                ) : isMcpEnabled && mcpUrl ? (
                  <p className="info-text">{t("mcp.running", { url: mcpUrl })}</p>
                ) : (
                  <p className="info-text">{t("mcp.stopped")}</p>
                )}
              </div>
            </div>
          ) : null}
        </SidebarSection>

        <SidebarSection
          icon={<Wifi />}
          isOpen={sectionOpenState.remote}
          label={t("sidebar.section.remote")}
          onOpenChange={(isOpen) => onSectionOpenChange("remote", isOpen)}
        >
          <RemoteAccessControls
            isLocalDevApiAvailable={remoteAccess.isLocalDevApiAvailable}
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
        </SidebarSection>
      </div>
    </section>
  );
}

type SidebarSectionProps = {
  children: ReactNode;
  icon: ReactNode;
  isOpen: boolean;
  label: string;
  onOpenChange: (isOpen: boolean) => void;
};

function SidebarSection({ children, icon, isOpen, label, onOpenChange }: SidebarSectionProps) {
  return (
    <section className="sidebar-section" data-open={isOpen}>
      <button
        aria-expanded={isOpen}
        className="sidebar-section-toggle"
        onClick={() => onOpenChange(!isOpen)}
        type="button"
      >
        <span className="sidebar-section-label">
          {icon}
          <span>{label}</span>
        </span>
        <ChevronDown aria-hidden="true" />
      </button>
      {isOpen ? <div className="sidebar-section-content">{children}</div> : null}
    </section>
  );
}
