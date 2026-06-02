import { useEffect, useState } from "react";
import { isTauriRuntime } from "./backend";
import {
  getPublicDevTunnelInfo,
  renderRemoteAccessQrCode,
  setLocalDevAccess,
  setPublicDevTunnel,
  type RemoteAccessMode,
} from "./remoteAccess";

export function useRemoteAccess() {
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
    if (!isTauriRuntime) return;
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
    try {
      const tunnelInfo = await getPublicDevTunnelInfo();
      if (!tunnelInfo) return;

      setIsPublicDevApiAvailable(true);
      if (tunnelInfo.enabled || tunnelInfo.isStarting || tunnelInfo.url) {
        await setPublicDevTunnelEnabled(false);
        return;
      }

      setIsPublicDevEnabled(false);
      setIsPublicDevStarting(false);
      setPublicDevUrl(null);
      setPublicDevError(null);
      setIsLocalDevEnabled(false);
      setLocalDevUrl(null);
      setLocalDevError(null);
    } catch {
      setIsPublicDevApiAvailable(false);
    }
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
    } catch (error) {
      setIsPublicDevEnabled(false);
      setIsPublicDevStarting(false);
      setPublicDevUrl(null);
      setPublicDevError(String(error instanceof Error ? error.message : error));
    }
  }

  async function setLocalDevAccessEnabled(enabled: boolean) {
    setLocalDevError(null);
    setIsLocalDevEnabled(enabled);

    try {
      const accessInfo = await setLocalDevAccess(enabled);
      setIsLocalDevEnabled(accessInfo.enabled);
      setLocalDevUrl(accessInfo.url);
    } catch (error) {
      setIsLocalDevEnabled(false);
      setLocalDevUrl(null);
      setLocalDevError(String(error instanceof Error ? error.message : error));
    }
  }

  async function setRemoteAccessMode(nextMode: RemoteAccessMode) {
    if (nextMode === "off") {
      setLocalDevError(null);
      setIsLocalDevEnabled(false);
      setLocalDevUrl(null);
      if (isPublicDevEnabled || isPublicDevStarting || publicDevUrl) {
        await setPublicDevTunnelEnabled(false);
      } else {
        setPublicDevError(null);
        setIsPublicDevEnabled(false);
        setIsPublicDevStarting(false);
        setPublicDevUrl(null);
      }
      return;
    }

    if (nextMode === "lan") {
      if (isPublicDevEnabled || isPublicDevStarting || publicDevUrl) {
        await setPublicDevTunnelEnabled(false);
      } else {
        setPublicDevError(null);
      }
      await setLocalDevAccessEnabled(true);
      return;
    }

    setLocalDevError(null);
    setIsLocalDevEnabled(false);
    setLocalDevUrl(null);
    await setPublicDevTunnelEnabled(true);
  }

  return {
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
