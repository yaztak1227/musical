import type { EntityId } from "@/types/audio";
import type { RemoteAudioAnalysisSegment } from "@/lib/backend";

export type RemoteAudioAnalysisPacket = {
  currentTimeAtReceived: number;
  duration: number;
  frameTimecodes: number[];
  frames: number[][];
  receivedAt: number;
  startTime: number;
};

export type RemoteAudioAnalysisFrameEntry = {
  timecode: number;
  values: number[];
};

export function getAudioAnalysisTick(timecode: number, sampleIntervalMs: number) {
  return Math.round((timecode * 1000) / sampleIntervalMs);
}

export function getRoundedAudioAnalysisTimecode(timecode: number, sampleIntervalMs: number) {
  return (getAudioAnalysisTick(timecode, sampleIntervalMs) * sampleIntervalMs) / 1000;
}

export function makeAudioAnalysisPacketFromSegment(
  segment: RemoteAudioAnalysisSegment,
  currentTimeAtReceived: number,
  sampleIntervalMs: number,
  receivedAt: number,
) {
  return makeAudioAnalysisPacketFromFrames(
    segment.trackId,
    segment.frames,
    segment.frameIntervalMs,
    currentTimeAtReceived,
    sampleIntervalMs,
    receivedAt,
  );
}

export function makeAudioAnalysisPacketFromFrames(
  _trackId: EntityId,
  frames: RemoteAudioAnalysisFrameEntry[],
  frameIntervalMs: number,
  currentTimeAtReceived: number,
  sampleIntervalMs: number,
  receivedAt: number,
) {
  if (frames.length === 0) return null;

  return {
    currentTimeAtReceived,
    duration: Math.max(sampleIntervalMs, frames.length * frameIntervalMs),
    frameTimecodes: frames.map((frame) => getRoundedAudioAnalysisTimecode(frame.timecode, sampleIntervalMs)),
    frames: frames.map((frame) => frame.values.slice()),
    receivedAt,
    startTime: getRoundedAudioAnalysisTimecode(frames[0]?.timecode ?? 0, sampleIntervalMs),
  } satisfies RemoteAudioAnalysisPacket;
}

export function rebaseAudioAnalysisPacketPlaybackTime(
  packet: RemoteAudioAnalysisPacket,
  currentTimeAtReceived: number,
  receivedAt: number,
) {
  return {
    ...packet,
    currentTimeAtReceived,
    receivedAt,
  } satisfies RemoteAudioAnalysisPacket;
}

export function mergeRemoteAudioAnalysisFrames(
  currentFrames: RemoteAudioAnalysisFrameEntry[],
  nextFrames: RemoteAudioAnalysisFrameEntry[],
  sampleIntervalMs: number,
) {
  const framesByTick = new Map<number, RemoteAudioAnalysisFrameEntry>();

  for (const frame of currentFrames) {
    framesByTick.set(getAudioAnalysisTick(frame.timecode, sampleIntervalMs), {
      timecode: getRoundedAudioAnalysisTimecode(frame.timecode, sampleIntervalMs),
      values: frame.values.slice(),
    });
  }

  for (const frame of nextFrames) {
    framesByTick.set(getAudioAnalysisTick(frame.timecode, sampleIntervalMs), {
      timecode: getRoundedAudioAnalysisTimecode(frame.timecode, sampleIntervalMs),
      values: frame.values.slice(),
    });
  }

  return Array.from(framesByTick.values()).sort((first, second) => first.timecode - second.timecode);
}
