import type { TFunction } from "@/types/app";
import type { RemoteAccessMode } from "@/lib/remoteAccess";

type RemoteAccessControlsProps = {
  isLocalDevEnabled: boolean;
  isPublicDevApiAvailable: boolean;
  isPublicDevEnabled: boolean;
  isPublicDevStarting: boolean;
  isTauriRuntime: boolean;
  localDevError: string | null;
  localDevQrDataUrl: string | null;
  localDevUrl: string | null;
  onRemoteAccessModeChange: (mode: RemoteAccessMode) => void;
  publicDevError: string | null;
  publicDevQrDataUrl: string | null;
  publicDevUrl: string | null;
  remoteAccessMode: RemoteAccessMode;
  t: TFunction;
};

export function RemoteAccessControls({
  isLocalDevEnabled,
  isPublicDevApiAvailable,
  isPublicDevEnabled,
  isPublicDevStarting,
  isTauriRuntime,
  localDevError,
  localDevQrDataUrl,
  localDevUrl,
  onRemoteAccessModeChange,
  publicDevError,
  publicDevQrDataUrl,
  publicDevUrl,
  remoteAccessMode,
  t,
}: RemoteAccessControlsProps) {
  if (!isTauriRuntime || !isPublicDevApiAvailable) return null;

  return (
    <>
      <div className="remote-access-mode" role="group" aria-label={t("remoteAccess.modeLabel")}>
        {(["off", "lan", "open"] as const).map((mode) => (
          <button
            aria-pressed={remoteAccessMode === mode}
            className="remote-access-mode-button"
            data-active={remoteAccessMode === mode}
            disabled={isPublicDevStarting && mode !== "open"}
            key={mode}
            onClick={() => onRemoteAccessModeChange(mode)}
            type="button"
          >
            {t(`remoteAccess.mode.${mode}`)}
          </button>
        ))}
      </div>

      {isLocalDevEnabled || localDevError ? (
        <section className="remote-access-panel" aria-label={t("remoteAccess.localLabel")}>
          <div className="remote-access-copy">
            <p className="eyebrow">{t("remoteAccess.localLabel")}</p>
            <p>
              {localDevError
                ? t("remoteAccess.localError", { message: localDevError })
                : localDevUrl
                  ? t("remoteAccess.localDescription")
                  : t("remoteAccess.localStarting")}
            </p>
          </div>
          {localDevUrl ? (
            <>
              {localDevQrDataUrl ? (
                <img className="remote-access-qr" src={localDevQrDataUrl} alt={t("remoteAccess.localQrAlt")} />
              ) : (
                <div className="remote-access-qr remote-access-qr-loading" aria-hidden="true" />
              )}
              <a className="remote-access-link" href={localDevUrl} target="_blank" rel="noreferrer">
                {t("remoteAccess.openLocalLink")}
              </a>
            </>
          ) : localDevError ? null : (
            <div className="remote-access-qr remote-access-qr-loading" aria-hidden="true" />
          )}
        </section>
      ) : null}

      {isPublicDevEnabled || publicDevError ? (
        <section className="remote-access-panel" aria-label={t("remoteAccess.label")}>
          <div className="remote-access-copy">
            <p className="eyebrow">{t("remoteAccess.label")}</p>
            <p>
              {publicDevError
                ? t("remoteAccess.error", { message: publicDevError })
                : publicDevUrl
                  ? t("remoteAccess.description")
                  : t("remoteAccess.starting")}
            </p>
          </div>
          {publicDevUrl ? (
            <>
              {publicDevQrDataUrl ? (
                <img className="remote-access-qr" src={publicDevQrDataUrl} alt={t("remoteAccess.qrAlt")} />
              ) : (
                <div className="remote-access-qr remote-access-qr-loading" aria-hidden="true" />
              )}
              <a className="remote-access-link" href={publicDevUrl} target="_blank" rel="noreferrer">
                {t("remoteAccess.openLink")}
              </a>
            </>
          ) : publicDevError ? null : (
            <div className="remote-access-qr remote-access-qr-loading" aria-hidden="true" />
          )}
        </section>
      ) : null}
    </>
  );
}
