import type { Album, Track } from "@/types/audio";

export function shuffleTracks(tracks: Track[]) {
  const shuffledTracks = [...tracks];
  for (let index = shuffledTracks.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledTracks[index], shuffledTracks[randomIndex]] = [shuffledTracks[randomIndex], shuffledTracks[index]];
  }
  return shuffledTracks;
}

export function getAlbumQueueTracks(album: Album, isShuffle: boolean, startTrack: Track | null = null) {
  if (!isShuffle) return album.tracks;

  if (!startTrack) return shuffleTracks(album.tracks);

  const shuffledRemainder = shuffleTracks(album.tracks.filter((track) => track.id !== startTrack.id));
  return [startTrack, ...shuffledRemainder];
}

export function getToggledQueueTracks(album: Album, isShuffle: boolean, currentTrack: Track | null) {
  if (!isShuffle) return album.tracks;
  return getAlbumQueueTracks(album, true, currentTrack);
}
