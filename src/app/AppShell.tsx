import { lazy, Suspense } from "react";
import { AlbumBrowser } from "../components/AlbumBrowser";
import { LibrarySettingsDialog } from "../components/LibrarySettingsDialog";
import { LibrarySidebar } from "../components/LibrarySidebar";
import { PlayerBar } from "../components/PlayerBar";
import { SelectedAlbumPanel } from "../components/SelectedAlbumPanel";
import { SelectedPlaylistPanel } from "../components/SelectedPlaylistPanel";
import { TrackDetailDialog } from "../components/TrackDetailDialog";
import { useLibraryController } from "../features/library/presentation/useLibraryController";
import { usePlaybackController } from "../features/playback/presentation/usePlaybackController";
import { useRemoteAudioAnalysis } from "../features/remote-player/presentation/useRemoteAudioAnalysis";
import { useRemotePlayerSync } from "../features/remote-player/presentation/useRemotePlayerSync";
import { useTagEditingController } from "../features/tag-editing/presentation/useTagEditingController";
import { useAlbumPanelGesture } from "../features/ui-interactions/presentation/useAlbumPanelGesture";
import { useTrackLongPress } from "../features/ui-interactions/presentation/useTrackLongPress";
import type { AppController } from "./hooks/useAppController";

const PlayerVisualizerOverlay = lazy(() => import("../components/PlayerVisualizerOverlay"));

type AppShellProps = {
  controller: AppController;
};

export function AppShell({ controller }: AppShellProps) {
  const {
    albumListMode,
    albumPanelDragStartRef,
    albumPanelRef,
    albumSortDirection,
    albumSortMode,
    albumTagDraft,
    albumTagMessage,
    albumViewMode,
    albumsPanelRef,
    addTracksToSelectedPlaylist,
    addTrackToSelectedPlaylist,
    artworkDraftPath,
    artworkPreviewSrc,
    audioAnalysisPacketRef,
    audioRef,
    availableAppUpdate,
    cancelAlbumTagEditing,
    changeLibrarySidebarSectionOpen,
    changeMcpEnabled,
    changePlaying,
    changeShuffle,
    changeTrackDetailTab,
    chooseArtwork,
    choosePlaylistArtwork,
    closeTrackDetail,
    createEmptyPlaylist,
    currentLyrics,
    currentTrack,
    cycleRepeatMode,
    deleteSelectedPlaylist,
    detailAlbum,
    detailArtworkSrc,
    detailLyrics,
    detailTrack,
    displayedLibraryPath,
    editingTrackTag,
    filteredAlbums,
    finishAlbumPanelPointerDrag,
    finishAlbumPanelTouchDrag,
    finishTrackLongPress,
    handleCheckForUpdate,
    handleChooseFolder,
    handleScan,
    handleTrackEnded,
    hasAlbumTagChanges,
    hasRealBackend,
    hasTrackTagChanges,
    isAlbumPanelCollapsed,
    isAlbumTagEditing,
    isBrowserBackendRuntime,
    isCheckingForUpdate,
    isLibraryMenuOpen,
    isLibrarySettingsOpen,
    isMcpEnabled,
    isMockDataRuntime,
    isPlayerVisualizerOpen,
    isPlaying,
    isSavingAlbumTags,
    isSavingArtwork,
    isSavingPlaylistArtwork,
    isSavingTrackTags,
    isSavingTrackUserState,
    isScanning,
    isShuffle,
    isSidebarCollapsed,
    isTauriRuntime,
    libraryInfo,
    libraryPath,
    librarySidebarSectionState,
    libraryWorkerInfo,
    locale,
    lyricsOnly,
    mcpError,
    mcpUrl,
    moveTrackLongPress,
    openAlbumFromPlaylist,
    openPlaylistAddTracks,
    openSelectedAlbumArtworkEditor,
    openTrackDetail,
    openTrackLyrics,
    overscrollAlbumPanelPointer,
    overscrollAlbumPanelTouch,
    pausePlayback,
    playAlbum,
    playNextTrack,
    playPreviousTrack,
    playPlaylist,
    playQueuedTrack,
    playTrack,
    playbackAlbum,
    playbackError,
    playbackPlaylist,
    playerBarRef,
    playlists,
    query,
    queue,
    remoteAccess,
    remotePlaybackClockRef,
    reloadPlaylists,
    removeTrackFromSelectedPlaylist,
    renameSelectedPlaylist,
    repeatMode,
    reorderTrackInSelectedPlaylist,
    saveAlbumTags,
    saveTrackArtwork,
    saveTrackTags,
    saveTrackUserState,
    scrollAlbumPanel,
    seekTo,
    selectAlbum,
    selectedAlbum,
    selectedAlbumTrackEntries,
    selectedPlaylist,
    selectedPlaylistId,
    selectedPlaylistTrackEntries,
    selectedTrackId,
    selectPlaylist,
    selectTrack,
    setAlbumListMode,
    setAlbumSortDirection,
    setAlbumSortMode,
    setAlbumTagDraft,
    setAlbumViewMode,
    setIsLibraryMenuOpen,
    setIsLibrarySettingsOpen,
    setIsPlayerVisualizerOpen,
    setIsSidebarCollapsed,
    setLocale,
    setLyricsOnly,
    setPlaybackError,
    setQuery,
    setThemeName,
    setTrackTagDraft,
    setEditingTrackTag,
    setLibraryPath,
    setVolume,
    shouldShowLibraryStatus,
    startAlbumPanelPointerDrag,
    startAlbumPanelTouchDrag,
    startAlbumTagEditing,
    startTrackLongPress,
    t,
    themeName,
    togglePlayback,
    trackDetailTab,
    trackTagDraft,
    trackTagMessage,
    updateInfo,
  } = controller;

  const albumPanelGesture = useAlbumPanelGesture({
    onAlbumPanelPointerCancel: (event) => {
      if (event.pointerType === "touch") return;
      albumPanelDragStartRef.current = null;
    },
    onAlbumPanelPointerDown: startAlbumPanelPointerDrag,
    onAlbumPanelPointerMove: overscrollAlbumPanelPointer,
    onAlbumPanelPointerUp: finishAlbumPanelPointerDrag,
    onAlbumPanelTouchCancel: () => {
      albumPanelDragStartRef.current = null;
    },
    onAlbumPanelTouchEnd: finishAlbumPanelTouchDrag,
    onAlbumPanelTouchMove: overscrollAlbumPanelTouch,
    onAlbumPanelTouchStart: startAlbumPanelTouchDrag,
    onAlbumPanelWheel: scrollAlbumPanel,
  });
  const trackLongPress = useTrackLongPress({
    onFinishTrackLongPress: finishTrackLongPress,
    onMoveTrackLongPress: moveTrackLongPress,
    onStartTrackLongPress: startTrackLongPress,
  });
  const remotePlayer = useRemotePlayerSync({ remotePlaybackClockRef });
  const remoteAudioAnalysis = useRemoteAudioAnalysis({ audioAnalysisPacketRef });

  const library = useLibraryController({
    albumBrowserProps: {
      albumSortDirection,
      albumSortMode,
      albumListMode,
      albums: filteredAlbums,
      albumViewMode,
      isPlaying,
      isTauriRuntime: hasRealBackend,
      lyricsOnly,
      playbackAlbumId: playbackAlbum?.id ?? null,
      onCreatePlaylist: (name) => void createEmptyPlaylist(name),
      onPausePlayback: pausePlayback,
      onPlayAlbum: playAlbum,
      onPlayPlaylist: playPlaylist,
      onListModeChange: setAlbumListMode,
      onLyricsOnlyChange: setLyricsOnly,
      onOpenTrackLyrics: openTrackLyrics,
      onPlayTrack: playTrack,
      onQueryChange: setQuery,
      onSelectAlbum: selectAlbum,
      onSelectPlaylist: selectPlaylist,
      onSortDirectionChange: setAlbumSortDirection,
      onSortModeChange: setAlbumSortMode,
      onViewModeChange: setAlbumViewMode,
      panelRef: albumsPanelRef,
      playlists,
      query,
      selectedAlbumId: selectedAlbum?.id ?? null,
      selectedPlaylistId,
      t,
    },
    librarySettingsDialogProps: isLibrarySettingsOpen
      ? {
          isScanning,
          isTauriRuntime,
          libraryInfo,
          libraryPath,
          workerInfo: libraryWorkerInfo,
          onChooseFolder: () => void handleChooseFolder(),
          onClose: () => setIsLibrarySettingsOpen(false),
          onLibraryPathChange: setLibraryPath,
          onScan: () => void handleScan(),
          t,
        }
      : null,
    librarySidebarProps: {
      displayedLibraryPath,
      hasAvailableAppUpdate: availableAppUpdate !== null,
      isCheckingForUpdate,
      isLibraryMenuOpen,
      isMcpEnabled,
      isSidebarCollapsed,
      isTauriRuntime: hasRealBackend,
      locale,
      mcpError,
      mcpUrl,
      updateInfo,
      onCheckForUpdate: () => void handleCheckForUpdate(),
      onLibraryMenuOpenChange: setIsLibraryMenuOpen,
      onLocaleChange: setLocale,
      onMcpEnabledChange: (enabled) => void changeMcpEnabled(enabled),
      onOpenLibrarySettings: () => setIsLibrarySettingsOpen(true),
      onSectionOpenChange: changeLibrarySidebarSectionOpen,
      onSidebarCollapsedChange: setIsSidebarCollapsed,
      onThemeNameChange: setThemeName,
      remoteAccess,
      sectionOpenState: librarySidebarSectionState,
      t,
      themeName,
    },
  });

  const playback = usePlaybackController({
    playerBarProps: {
      audioRef,
      currentAlbum: playbackAlbum,
      currentTrack,
      isPlaying,
      isRemoteSynced: isBrowserBackendRuntime,
      isShuffle,
      isTauriRuntime,
      onCycleRepeat: cycleRepeatMode,
      onEnded: handleTrackEnded,
      onNextTrack: () => playNextTrack(),
      onPlaybackError: setPlaybackError,
      onPlayingChange: changePlaying,
      onPreviousTrack: playPreviousTrack,
      onSeek: seekTo,
      onSelectCurrentAlbum: () => {
        if (playbackAlbum) selectAlbum(playbackAlbum);
      },
      onShuffleChange: changeShuffle,
      onTogglePlayback: togglePlayback,
      onOpenVisualizer: () => setIsPlayerVisualizerOpen(true),
      onVolumeChange: setVolume,
      playbackError,
      playbackPlaylist,
      queueLength: queue.length,
      queueTracks: queue,
      ref: playerBarRef,
      repeatMode,
      t,
    },
  });

  const tagEditing = useTagEditingController({
    selectedAlbumPanelProps: {
      albumPanelRef,
      albumTagDraft,
      albumTagMessage,
      currentTrack,
      hasAlbumTagChanges,
      isAlbumPanelCollapsed,
      isAlbumTagEditing,
      isSavingAlbumTags,
      ...albumPanelGesture,
      onAlbumTagDraftChange: setAlbumTagDraft,
      onCancelAlbumTagEditing: cancelAlbumTagEditing,
      ...trackLongPress,
      onOpenSelectedAlbumArtworkEditor: openSelectedAlbumArtworkEditor,
      onOpenTrackDetail: openTrackDetail,
      onAddTrackToPlaylist: (track, playlist) => void addTrackToSelectedPlaylist(track, playlist),
      onAddTracksToPlaylist: (tracks, playlist) => void addTracksToSelectedPlaylist(tracks, playlist),
      onPlayTrack: playTrack,
      onSaveAlbumTags: () => void saveAlbumTags(),
      onSelectTrack: selectTrack,
      onStartAlbumTagEditing: startAlbumTagEditing,
      selectedAlbum,
      selectedTrackId,
      playlists,
      t,
      trackEntries: selectedAlbumTrackEntries,
    },
    trackDetailDialogProps: detailTrack && detailAlbum
      ? {
          artworkDraftPath,
          artworkPreviewSrc,
          detailAlbum,
          detailArtworkSrc,
          detailLyrics,
          detailTrack,
          editingTrackTag,
          hasRealBackend,
          hasTrackTagChanges,
          isSavingArtwork,
          isSavingTrackTags,
          isSavingTrackUserState,
          isTauriRuntime,
          onChangeTab: changeTrackDetailTab,
          onChooseArtwork: () => void chooseArtwork(),
          onClose: closeTrackDetail,
          onSaveArtwork: () => void saveTrackArtwork(),
          onSaveTrackTags: () => void saveTrackTags(),
          onTrackFavoriteChange: (isFavorite) => void saveTrackUserState(isFavorite, detailTrack.rating ?? null),
          onTrackRatingChange: (rating) => void saveTrackUserState(Boolean(detailTrack.isFavorite), rating),
          onTrackTagDraftChange: setTrackTagDraft,
          onTrackTagEditChange: setEditingTrackTag,
          t,
          trackDetailTab,
          trackTagDraft,
          trackTagMessage,
        }
      : null,
  });

  return (
      <main
        className={[
          "app-shell",
          isSidebarCollapsed ? "sidebar-collapsed" : "",
          isAlbumPanelCollapsed ? "album-panel-collapsed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <audio ref={audioRef} preload="metadata" />
        <LibrarySidebar {...library.librarySidebarProps} />

        <AlbumBrowser {...library.albumBrowserProps} />

        {selectedPlaylist ? (
          <SelectedPlaylistPanel
            albumPanelRef={albumPanelRef}
            currentTrack={currentTrack}
            isAlbumPanelCollapsed={isAlbumPanelCollapsed}
            {...albumPanelGesture}
            onDeletePlaylist={(playlist) => void deleteSelectedPlaylist(playlist)}
            onJumpToAlbum={openAlbumFromPlaylist}
            onOpenAddTracks={openPlaylistAddTracks}
            onOpenTrackDetail={openTrackDetail}
            onOpenTrackLyrics={openTrackLyrics}
            onChooseArtwork={choosePlaylistArtwork}
            onPlayTrack={playTrack}
            onPlayPlaylist={playPlaylist}
            onReloadPlaylist={() => void reloadPlaylists()}
            onRemoveTrack={(playlist, trackIndex) => void removeTrackFromSelectedPlaylist(playlist, trackIndex)}
            onRenamePlaylist={(playlist, name) => void renameSelectedPlaylist(playlist, name)}
            onReorderTrack={(playlist, fromIndex, toIndex) => void reorderTrackInSelectedPlaylist(playlist, fromIndex, toIndex)}
            onSelectTrack={selectTrack}
            isSavingArtwork={isSavingPlaylistArtwork}
            playlist={selectedPlaylist}
            selectedTrackId={selectedTrackId}
            t={t}
            trackEntries={selectedPlaylistTrackEntries}
          />
        ) : (
          <SelectedAlbumPanel {...tagEditing.selectedAlbumPanelProps} />
        )}

        {shouldShowLibraryStatus && libraryInfo ? (
          <section className="library-status-bar" aria-live="polite">
            <span className="library-status-message">{t(libraryInfo.key, libraryInfo.values)}</span>
            <span className="library-worker-message">{t(libraryWorkerInfo.key, libraryWorkerInfo.values)}</span>
          </section>
        ) : null}

        <PlayerBar {...playback.playerBarProps} />
        {isPlayerVisualizerOpen ? (
          <Suspense fallback={null}>
            <PlayerVisualizerOverlay
              audioRef={audioRef}
            audioAnalysisPacketRef={remoteAudioAnalysis.audioAnalysisPacketRef}
              currentAlbum={playbackAlbum}
              currentLyrics={currentLyrics}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              queueTracks={queue}
              onClose={() => setIsPlayerVisualizerOpen(false)}
              onNextTrack={() => playNextTrack()}
              onPreviousTrack={playPreviousTrack}
              onQueueTrackPlay={playQueuedTrack}
              onTogglePlayback={togglePlayback}
              preferRemoteAudioAnalysis={isTauriRuntime || isBrowserBackendRuntime || isMockDataRuntime}
            remotePlaybackClockRef={remotePlayer.remotePlaybackClockRef}
              t={t}
            />
          </Suspense>
        ) : null}
      {library.librarySettingsDialogProps ? <LibrarySettingsDialog {...library.librarySettingsDialogProps} /> : null}
      {tagEditing.trackDetailDialogProps ? <TrackDetailDialog {...tagEditing.trackDetailDialogProps} /> : null}
      </main>
  );
}
