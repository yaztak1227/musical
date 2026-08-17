import { useEffect, useState } from "react";
import { getAppPreferences, updateAppPreferences } from "./appPreferences";
import {
  getLocalDevAccessInfo,
  getPublicDevTunnelInfo,
  renderRemoteAccessQrCode,
  setLocalDevAccess,
  setPublicDevTunnel,
  type RemoteAccessMode,
} from "./remoteAccess";

export function useRemoteAccess() {
  const [isLocalDevApiAvailable, setIsLocalDevApiAvailable] = useState(false);
  const [isPublicDevApiAvailable, setIsPublicDevApiAvailable] = useState(false);
  const [isPublicDevEnabled, setIsPublicDevEnabled] = useState(false);
  const [isPublicDevStarting, setIsPublicDevStarting] = useState(false);
  const [publicDevUrl, setPublicDevUrl] = useState<string | null>(null);
  const [publicDevQrDataUrl, setPublicDevQrDataUrl] = useState<string | null>(null);
  const [publicDevError, setPublicDevError] = useState<string | null>(null);
  const [isLocalDevEnabled, setIsLocalDevEnabled] = useState(false);
  const [localDevUrl, setLocalDevUrl] = useState<string | null>(null);
  const [localDevQrDataUrl, setLocalDevQrDataUrl] = useState<string | null>(null);
  const [localDevError, setLocalDevError] = useState<string | null>(null);

  const remoteAccessMode: RemoteAccessMode = isPublicDevEnabled || isPublicDevStarting ? "open" : isLocalDevEnabled ? "lan" : "off";

  useEffect(() => {
    void initializeRemoteAccessMode();
  }, []);

  useEffect(() => {
    let isActive = true;

    void renderRemoteAccessQrCode(publicDevUrl).then((dataUrl) => {
      if (isActive) setPublicDevQrDataUrl(dataUrl);
    }).catch(() => {
      if (isActive) setPublicDevQrDataUrl(null);
    });

    return () => {
      isActive = false;
    };
  }, [publicDevUrl]);

  useEffect(() => {
    let isActive = true;

    void renderRemoteAccessQrCode(localDevUrl).then((dataUrl) => {
      if (isActive) setLocalDevQrDataUrl(dataUrl);
    }).catch(() => {
      if (isActive) setLocalDevQrDataUrl(null);
    });

    return () => {
      isActive = false;
    };
  }, [localDevUrl]);

  async function initializeRemoteAccessMode() {
    const preferredMode = await getAppPreferences()
      .then((preferences) => preferences.remoteAccessMode)
      .catch(() => null);
    let nextLocalInfo = null;

    try {
      nextLocalInfo = await getLocalDevAccessInfo();
      setIsLocalDevApiAvailable(Boolean(nextLocalInfo));
      setIsLocalDevEnabled(nextLocalInfo?.enabled ?? false);
      setLocalDevUrl(nextLocalInfo?.url ?? null);
      setLocalDevError(null);
    } catch {
      setIsLocalDevApiAvailable(false);
      setIsLocalDevEnabled(false);
      setLocalDevUrl(null);
    }

    let nextPublicInfo = null;
    if (import.meta.env.DEV) {
      try {
        nextPublicInfo = await getPublicDevTunnelInfo();
        setIsPublicDevApiAvailable(Boolean(nextPublicInfo));
        setIsPublicDevEnabled(nextPublicInfo?.enabled ?? false);
        setIsPublicDevStarting(nextPublicInfo?.isStarting ?? false);
        setPublicDevUrl(nextPublicInfo?.url ?? null);
        setPublicDevError(null);
      } catch {
        setIsPublicDevApiAvailable(false);
        setIsPublicDevEnabled(false);
        setIsPublicDevStarting(false);
        setPublicDevUrl(null);
      }
    } else {
      setIsPublicDevApiAvailable(false);
    }

    const restoredMode = preferredMode
      ?? (nextPublicInfo?.enabled || nextPublicInfo?.isStarting ? "open" : nextLocalInfo?.enabled ? "lan" : "off");
    await applyRemoteAccessMode(restoredMode, {
      canUseLocal: Boolean(nextLocalInfo),
      canUsePublic: Boolean(nextPublicInfo),
    });
  }

  async function setPublicDevTunnelEnabled(enabled: boolean) {
    setPublicDevError(null);
    setIsPublicDevEnabled(enabled);
    setIsPublicDevStarting(enabled);

    try {
      const tunnelInfo = await setPublicDevTunnel(enabled);
      setIsPublicDevApiAvailable(true);
      setIsPublicDevEnabled(tunnelInfo.enabled);
      setIsPublicDevStarting(tunnelInfo.isStarting);
      setPublicDevUrl(tunnelInfo.url);
      return tunnelInfo.enabled === enabled;
    } catch (error) {
      setIsPublicDevEnabled(false);
      setIsPublicDevStarting(false);
      setPublicDevUrl(null);
      setPublicDevError(String(error instanceof Error ? error.message : error));
      return false;
    }
  }

  async function setLocalDevAccessEnabled(enabled: boolean) {
    setLocalDevError(null);
    setIsLocalDevEnabled(enabled);

    try {
      const accessInfo = await setLocalDevAccess(enabled);
      setIsLocalDevApiAvailable(true);
      setIsLocalDevEnabled(accessInfo.enabled);
      setLocalDevUrl(accessInfo.url);
      return accessInfo.enabled === enabled;
    } catch (error) {
      setIsLocalDevEnabled(false);
      setLocalDevUrl(null);
      setLocalDevError(String(error instanceof Error ? error.message : error));
      return false;
    }
  }

  async function setRemoteAccessMode(nextMode: RemoteAccessMode) {
    if (nextMode !== "off") {
      try {
        await updateAppPreferences({ remoteAccessMode: nextMode });
      } catch (error) {
        setRemoteAccessPreferenceError(nextMode, error);
        return;
      }
    }

    const applied = await applyRemoteAccessMode(nextMode, {
      canUseLocal: isLocalDevApiAvailable,
      canUsePublic: isPublicDevApiAvailable,
    });
    if (!applied) {
      if (nextMode !== "off") {
        await updateAppPreferences({ remoteAccessMode: "off" }).catch(() => {
          // The runtime is already private; a rollback write failure must not reopen it.
        });
      }
      return;
    }
    if (nextMode === "off") {
      try {
        await updateAppPreferences({ remoteAccessMode: "off" });
      } catch (error) {
        setRemoteAccessPreferenceError(nextMode, error);
      }
    }
  }

  function setRemoteAccessPreferenceError(mode: RemoteAccessMode, error: unknown) {
    const message = String(error instanceof Error ? error.message : error);
    if (mode === "lan") {
      setLocalDevError(message);
    } else {
      setPublicDevError(message);
    }
  }

  async function applyRemoteAccessMode(
    nextMode: RemoteAccessMode,
    capabilities: { canUseLocal: boolean; canUsePublic: boolean },
  ) {
    if (nextMode === "off") {
      let localDisabled = true;
      let publicDisabled = true;
      setLocalDevError(null);
      if (capabilities.canUseLocal) {
        localDisabled = await setLocalDevAccessEnabled(false);
      } else {
        setIsLocalDevEnabled(false);
        setLocalDevUrl(null);
      }
      if (capabilities.canUsePublic) {
        publicDisabled = await setPublicDevTunnelEnabled(false);
      } else {
        setPublicDevError(null);
        setIsPublicDevEnabled(false);
        setIsPublicDevStarting(false);
        setPublicDevUrl(null);
      }
      return localDisabled && publicDisabled;
    }

    if (nextMode === "lan") {
      if (!capabilities.canUseLocal) return false;
      if (capabilities.canUsePublic) {
        const publicDisabled = await setPublicDevTunnelEnabled(false);
        if (!publicDisabled) return false;
      } else {
        setPublicDevError(null);
      }
      return setLocalDevAccessEnabled(true);
    }

    if (!capabilities.canUsePublic) return false;
    setLocalDevError(null);
    if (capabilities.canUseLocal) {
      const localDisabled = await setLocalDevAccessEnabled(false);
      if (!localDisabled) return false;
    } else {
      setIsLocalDevEnabled(false);
      setLocalDevUrl(null);
    }
    return setPublicDevTunnelEnabled(true);
  }

  return {
    isLocalDevApiAvailable,
    isLocalDevEnabled,
    isPublicDevApiAvailable,
    isPublicDevEnabled,
    isPublicDevStarting,
    localDevError,
    localDevQrDataUrl,
    localDevUrl,
    publicDevError,
    publicDevQrDataUrl,
    publicDevUrl,
    remoteAccessMode,
    setRemoteAccessMode,
  };
}
