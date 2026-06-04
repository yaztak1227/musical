import { FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { I18nMessage, TFunction } from "@/types/app";

type LibrarySettingsDialogProps = {
  isScanning: boolean;
  isCheckingForUpdate: boolean;
  isTauriRuntime: boolean;
  libraryInfo: I18nMessage | null;
  libraryPath: string;
  updateInfo: I18nMessage | null;
  onChooseFolder: () => void;
  onClose: () => void;
  onCheckForUpdate: () => void;
  onLibraryPathChange: (path: string) => void;
  onScan: () => void;
  t: TFunction;
};

export function LibrarySettingsDialog({
  isScanning,
  isCheckingForUpdate,
  isTauriRuntime,
  libraryInfo,
  libraryPath,
  updateInfo,
  onChooseFolder,
  onCheckForUpdate,
  onClose,
  onLibraryPathChange,
  onScan,
  t,
}: LibrarySettingsDialogProps) {
  return (
    <div className="track-detail-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label={t("scan.libraryDialogLabel")}
        aria-modal="true"
        className="library-settings-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="track-detail-header">
          <div className="track-detail-title">
            <p className="eyebrow">{t("library.controls")}</p>
            <h2>{t("scan.libraryDialogTitle")}</h2>
          </div>
          <Button aria-label={t("trackDetail.close")} className="icon-button" onClick={onClose} type="button" variant="outline">
            <X />
          </Button>
        </div>

        <div className="scan-panel-content">
          <label className="search-field">
            <span>{t("scan.folderLabel")}</span>
            <div className="folder-picker-row">
              <Input
                data-keyboard-scope="text"
                onChange={(event) => onLibraryPathChange(event.currentTarget.value)}
                placeholder={t("scan.folderPlaceholder")}
                type="text"
                value={libraryPath}
              />
              <Button
                className="choose-folder-button"
                disabled={isScanning || !isTauriRuntime}
                onClick={onChooseFolder}
                title={!isTauriRuntime ? t("status.desktopOnly") : undefined}
                variant="outline"
                type="button"
              >
                <FolderOpen />
                {t("scan.chooseFolder")}
              </Button>
            </div>
          </label>

          <div className="scan-actions">
            <Button className="scan-button" disabled={isScanning} onClick={onScan} type="button">
              {isScanning ? t("scan.buttonScanning") : t("scan.button")}
            </Button>
            {isScanning ? (
              <div className="scan-loading-rail" aria-hidden="true">
                <span className="scan-note">♪</span>
                <span className="scan-note">♫</span>
                <span className="scan-note">♬</span>
                <span className="scan-skeleton-card" />
                <span className="scan-skeleton-card" />
                <span className="scan-skeleton-card" />
              </div>
            ) : null}
            {libraryInfo ? (
              <p className="info-text" aria-live="polite">
                {t(libraryInfo.key, libraryInfo.values)}
              </p>
            ) : null}
          </div>

          <div className="update-actions">
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
        </div>
      </section>
    </div>
  );
}
