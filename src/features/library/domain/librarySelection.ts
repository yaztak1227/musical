import type { Album, EntityId, Track } from "@/types/audio";

export function findTrackById(albums: Album[], trackId: EntityId | null) {
  if (trackId === null) return null;
  for (const album of albums) {
    const track = album.tracks.find((track) => track.id === trackId);
    if (track) return track;
  }
  return null;
}

export function findAlbumByTrackId(albums: Album[], trackId: EntityId | null) {
  if (trackId === null) return null;
  return albums.find((album) => album.tracks.some((track) => track.id === trackId)) ?? null;
}

export function findTracksByIds(albums: Album[], trackIds: EntityId[]) {
  const tracksById = new Map(albums.flatMap((album) => album.tracks).map((track) => [track.id, track]));
  return trackIds.map((trackId) => tracksById.get(trackId)).filter((track): track is Track => Boolean(track));
}
