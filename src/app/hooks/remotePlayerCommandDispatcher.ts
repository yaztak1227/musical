import type { QueuedRemotePlayerCommand } from "../../lib/backend";
import type { Album, EntityId, Track } from "../../types/audio";
import type { RepeatMode } from "../../types/app";
import { getAlbumQueueTracks, getNextRepeatMode } from "../../lib/playback";
import {
  getCommandBoolean,
  getCommandEntityId,
  getCommandEntityIdArray,
  getCommandNumber,
  getCommandRepeatMode,
} from "../../features/remote-player/domain/remoteCommand";

type RemotePlayerCommandContext = {
  albums: Album[];
  findAlbumByTrackId: (trackId: EntityId | null) => Album | null;
  findTrackById: (trackId: EntityId | null) => Track | null;
  findTracksByIds: (trackIds: EntityId[]) => Track[];
  isShuffle: boolean;
  playNextTrack: () => void;
  playPlayback: () => void;
  playPreviousTrack: () => void;
  pausePlayback: () => void;
  refreshLibrary: () => Promise<void>;
  refreshPlaylist: (playlistId: EntityId) => Promise<void>;
  repeatMode: RepeatMode;
  selectAlbum: (album: Album) => void;
  selectTrack: (track: Track) => void;
  seekTo: (nextTime: number) => void;
  setCurrentTrack: (track: Track | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlaybackAlbumId: (albumId: EntityId | null) => void;
  setPlaybackPlaylistId: (playlistId: EntityId | null) => void;
  setPlaybackQueueTrackIds: (trackIds: EntityId[]) => void;
  setIsShuffle: (isShuffle: boolean) => void;
  setRepeatMode: (repeatMode: RepeatMode) => void;
  setSelectedAlbumId: (albumId: EntityId | null) => void;
  setVolume: (nextVolume: number) => void;
  resetPlayerPosition: () => void;
  stepVolume: (delta: number) => void;
  toggleMute: () => void;
  togglePlayback: () => void;
  changeShuffle: (nextShuffle: boolean, source: string) => void;
};

type RemotePlayerCommandHandler = (
  command: QueuedRemotePlayerCommand,
  context: RemotePlayerCommandContext,
) => void;

const remotePlayerCommandHandlers: Partial<Record<QueuedRemotePlayerCommand["commandType"], RemotePlayerCommandHandler>> = {
  "cycle-repeat": (command, context) => {
    context.setRepeatMode(getCommandRepeatMode(command) ?? getNextRepeatMode(context.repeatMode));
  },
  next: (_command, context) => {
    context.playNextTrack();
  },
  pause: (_command, context) => {
    context.pausePlayback();
  },
  play: (_command, context) => {
    context.playPlayback();
  },
  "play-album": (command, context) => {
    const albumId = getCommandEntityId(command, "albumId");
    const album = context.albums.find((album) => album.id === albumId);
    if (album) playRemoteAlbum(album, command, context);
  },
  "play-track": (command, context) => {
    const trackId = getCommandEntityId(command, "trackId");
    const albumId = getCommandEntityId(command, "albumId") ?? context.findAlbumByTrackId(trackId)?.id ?? null;
    const track = context.findTrackById(trackId);
    if (track) playRemoteTrack(track, albumId, command, context);
  },
  previous: (_command, context) => {
    context.playPreviousTrack();
  },
  "refresh-library": (_command, context) => {
    void context.refreshLibrary();
  },
  "refresh-playlist": (command, context) => {
    const playlistId = getCommandEntityId(command, "playlistId");
    if (playlistId !== null) void context.refreshPlaylist(playlistId);
  },
  seek: (command, context) => {
    const time = getCommandNumber(command, "time");
    if (time !== null) context.seekTo(time);
  },
  "select-album": (command, context) => {
    const albumId = getCommandEntityId(command, "albumId");
    const album = context.albums.find((album) => album.id === albumId);
    if (album) context.selectAlbum(album);
  },
  "select-track": (command, context) => {
    const trackId = getCommandEntityId(command, "trackId");
    const track = context.findTrackById(trackId);
    if (track) context.selectTrack(track);
  },
  "clear-queue": (_command, context) => {
    context.setPlaybackPlaylistId(null);
    context.setPlaybackQueueTrackIds([]);
    context.setCurrentTrack(null);
    context.resetPlayerPosition();
    context.setIsPlaying(false);
  },
  "set-queue": (command, context) => {
    const queueTrackIds = getCommandEntityIdArray(command, "queueTrackIds") ?? [];
    const queue = context.findTracksByIds(queueTrackIds);
    const currentTrackId = getCommandEntityId(command, "currentTrackId") ?? queue[0]?.id ?? null;
    const currentTrack = context.findTrackById(currentTrackId) ?? queue[0] ?? null;
    const album = context.findAlbumByTrackId(currentTrack?.id ?? null);
    const shouldPlay = getCommandBoolean(command, "isPlaying") ?? getCommandBoolean(command, "play") ?? Boolean(currentTrack);

    context.setPlaybackAlbumId(album?.id ?? null);
    context.setPlaybackPlaylistId(null);
    context.setPlaybackQueueTrackIds(queueTrackIds);
    context.setCurrentTrack(currentTrack);
    context.resetPlayerPosition();
    context.setIsPlaying(Boolean(currentTrack) && shouldPlay);
  },
  "set-volume": (command, context) => {
    const volume = getCommandNumber(command, "volume");
    if (volume !== null) context.setVolume(volume);
  },
  "toggle-mute": (_command, context) => {
    context.toggleMute();
  },
  "toggle-playback": (_command, context) => {
    context.togglePlayback();
  },
  "toggle-shuffle": (command, context) => {
    context.changeShuffle(getCommandBoolean(command, "isShuffle") ?? !context.isShuffle, "remote-sync");
  },
  "volume-step": (command, context) => {
    const delta = getCommandNumber(command, "delta");
    if (delta !== null) context.stepVolume(delta);
  },
};

export function dispatchRemotePlayerCommand(
  command: QueuedRemotePlayerCommand,
  context: RemotePlayerCommandContext,
) {
  remotePlayerCommandHandlers[command.commandType]?.(command, context);
}

function playRemoteAlbum(
  album: Album,
  command: QueuedRemotePlayerCommand,
  context: RemotePlayerCommandContext,
) {
  const commandQueueTrackIds = getCommandEntityIdArray(command, "queueTrackIds");
  const commandQueue = commandQueueTrackIds ? context.findTracksByIds(commandQueueTrackIds) : [];
  const shouldShuffle = getCommandBoolean(command, "isShuffle") ?? context.isShuffle;
  const nextQueue = commandQueue.length > 0 ? commandQueue : getAlbumQueueTracks(album, shouldShuffle);
  const firstTrack = nextQueue[0] ?? null;

  context.setIsShuffle(shouldShuffle);
  context.setSelectedAlbumId(album.id);
  context.setPlaybackAlbumId(album.id);
  context.setPlaybackPlaylistId(null);
  context.setPlaybackQueueTrackIds(nextQueue.map((track) => track.id));
  context.setCurrentTrack(firstTrack);
  context.resetPlayerPosition();
  context.setIsPlaying(Boolean(firstTrack));
}

function playRemoteTrack(
  track: Track,
  albumId: EntityId | null,
  command: QueuedRemotePlayerCommand,
  context: RemotePlayerCommandContext,
) {
  const album = context.albums.find((album) => album.id === albumId) ?? context.findAlbumByTrackId(track.id);
  const commandQueueTrackIds = getCommandEntityIdArray(command, "queueTrackIds");
  const commandQueue = commandQueueTrackIds ? context.findTracksByIds(commandQueueTrackIds) : [];
  const shouldShuffle = getCommandBoolean(command, "isShuffle") ?? context.isShuffle;
  const nextQueue = commandQueue.length > 0 ? commandQueue : album ? getAlbumQueueTracks(album, shouldShuffle, track) : [track];

  context.setIsShuffle(shouldShuffle);
  context.setPlaybackAlbumId(album?.id ?? albumId);
  context.setPlaybackPlaylistId(getCommandEntityId(command, "playlistId"));
  context.setPlaybackQueueTrackIds(nextQueue.map((track) => track.id));
  context.setCurrentTrack(track);
  context.resetPlayerPosition();
  context.setIsPlaying(true);
}
