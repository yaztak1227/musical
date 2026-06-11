import type { AlbumTagDraft, TrackTagDraft } from "@/lib/tagEditing";
import type { Album, Track } from "@/types/audio";
import { isAlbumTagDraftChanged, parseOptionalYear } from "@/lib/tagDraftUtils";
import { isTrackTagDraftChanged } from "@/lib/trackTagDraftUtils";

export { isAlbumTagDraftChanged, isTrackTagDraftChanged, parseOptionalYear };

export function hasAlbumTagChanges(albumTagDraft: AlbumTagDraft, album: Album | null) {
  return album ? isAlbumTagDraftChanged(albumTagDraft, album) : false;
}

export function hasTrackTagChanges(trackTagDraft: TrackTagDraft, track: Track | null, album: Album | null) {
  return track ? isTrackTagDraftChanged(trackTagDraft, track, album) : false;
}
