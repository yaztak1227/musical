export type TvDisplayMessage =
  | { type: "session_snapshot"; snapshot: TvSessionSnapshot }
  | { type: "session_ready"; sessionId: string }
  | { type: "player_state"; state: TvPlayerState }
  | { type: "lyrics_state"; state: TvLyricsState }
  | { type: "queue_state"; state: TvQueueState }
  | { type: "analysis_packet"; packet: TvAudioAnalysisPacket }
  | { type: "command_result"; result: TvCommandResult }
  | { type: "candidate_prompt"; prompt: TvCandidatePrompt }
  | { type: "session_closed"; reason: string };

export type TvSessionSnapshot = {
  player: TvPlayerState;
  lyrics?: TvLyricsState;
  queue?: TvQueueState;
  analysis?: TvAudioAnalysisPacket;
  activePrompt?: TvCandidatePrompt;
};

export type TvPlayerState = {
  trackId: string | null;
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
  audioUrl?: string;
  isPlaying: boolean;
  durationSeconds: number;
  positionSeconds: number;
  updatedAt: string;
};

export type TvLyricsState = {
  trackId: string;
  mode: "plain" | "synced";
  lines: Array<{
    id: string;
    text: string;
    startSeconds?: number;
    endSeconds?: number;
  }>;
  activeLineId?: string;
};

export type TvQueueState = {
  currentTrackId: string | null;
  items: Array<{
    trackId: string;
    title: string;
    artist: string;
    album?: string;
    artworkUrl?: string;
    isCurrent: boolean;
  }>;
};

export type TvAudioAnalysisPacket = {
  trackId: string;
  frameIntervalMs: number;
  frames: TvAudioAnalysisFrame[];
  isComplete?: boolean;
};

export type TvAudioAnalysisFrame = {
  timeMs: number;
  bands: number[];
  peak?: number;
  rms?: number;
};

export type TvCommandResult = {
  id: string;
  status: "success" | "error" | "pending";
  title: string;
  detail?: string;
  createdAt: string;
};

export type TvCandidatePrompt = {
  id: string;
  title: string;
  candidates: Array<{
    id: string;
    label: string;
    description?: string;
    shortcutNumber?: number;
  }>;
  expiresAt?: string;
};
