import orchestraHoldingBackgroundSrc from "@/assets/generated/orchestra_visualizer/backgrounds/holding-background.png";
import orchestraPlayingBackgroundSrc from "@/assets/generated/orchestra_visualizer/backgrounds/playing-background.png";
import orchestraHoldingCelloSrc from "@/assets/generated/orchestra_visualizer/characters/holding/02-cello.png";
import orchestraHoldingClarinetSrc from "@/assets/generated/orchestra_visualizer/characters/holding/04-clarinet.png";
import orchestraHoldingFluteSrc from "@/assets/generated/orchestra_visualizer/characters/holding/03-flute.png";
import orchestraHoldingFrenchHornSrc from "@/assets/generated/orchestra_visualizer/characters/holding/07-french_horn.png";
import orchestraHoldingHarpSrc from "@/assets/generated/orchestra_visualizer/characters/holding/09-harp.png";
import orchestraHoldingTimpaniSrc from "@/assets/generated/orchestra_visualizer/characters/holding/08-timpani.png";
import orchestraHoldingTromboneSrc from "@/assets/generated/orchestra_visualizer/characters/holding/06-trombone.png";
import orchestraHoldingTrumpetSrc from "@/assets/generated/orchestra_visualizer/characters/holding/05-trumpet.png";
import orchestraHoldingViolinSrc from "@/assets/generated/orchestra_visualizer/characters/holding/01-violin.png";
import orchestraPlayingCelloSrc from "@/assets/generated/orchestra_visualizer/characters/playing/02-cello.png";
import orchestraPlayingClarinetSrc from "@/assets/generated/orchestra_visualizer/characters/playing/04-clarinet.png";
import orchestraPlayingFluteSrc from "@/assets/generated/orchestra_visualizer/characters/playing/03-flute.png";
import orchestraPlayingFrenchHornSrc from "@/assets/generated/orchestra_visualizer/characters/playing/07-french_horn.png";
import orchestraPlayingHarpSrc from "@/assets/generated/orchestra_visualizer/characters/playing/09-harp.png";
import orchestraPlayingTimpaniSrc from "@/assets/generated/orchestra_visualizer/characters/playing/08-timpani.png";
import orchestraPlayingTromboneSrc from "@/assets/generated/orchestra_visualizer/characters/playing/06-trombone.png";
import orchestraPlayingTrumpetSrc from "@/assets/generated/orchestra_visualizer/characters/playing/05-trumpet.png";
import orchestraPlayingViolinSrc from "@/assets/generated/orchestra_visualizer/characters/playing/01-violin.png";

export const orchestraBackgroundSources = {
  holding: orchestraHoldingBackgroundSrc,
  playing: orchestraPlayingBackgroundSrc,
} as const;

export const orchestraCharacterSources = [
  { holding: orchestraHoldingTromboneSrc, playing: orchestraPlayingTromboneSrc },
  { holding: orchestraHoldingFrenchHornSrc, playing: orchestraPlayingFrenchHornSrc },
  { holding: orchestraHoldingTimpaniSrc, playing: orchestraPlayingTimpaniSrc },
  { holding: orchestraHoldingHarpSrc, playing: orchestraPlayingHarpSrc },
  { holding: orchestraHoldingViolinSrc, playing: orchestraPlayingViolinSrc },
  { holding: orchestraHoldingCelloSrc, playing: orchestraPlayingCelloSrc },
  { holding: orchestraHoldingFluteSrc, playing: orchestraPlayingFluteSrc },
  { holding: orchestraHoldingClarinetSrc, playing: orchestraPlayingClarinetSrc },
  { holding: orchestraHoldingTrumpetSrc, playing: orchestraPlayingTrumpetSrc },
] as const;
