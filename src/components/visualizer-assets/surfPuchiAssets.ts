import surfPuchiBoyPaddlingSrc from "@/assets/surf-puchi-boy-paddling.png";
import surfPuchiBoyStandingSrc from "@/assets/surf-puchi-boy-standing.png";
import surfPuchiGirlPaddlingSrc from "@/assets/surf-puchi-girl-paddling.png";
import surfPuchiGirlStandingSrc from "@/assets/surf-puchi-girl-standing.png";

export const surfPuchiSources = {
  boy: {
    paddling: surfPuchiBoyPaddlingSrc,
    standing: surfPuchiBoyStandingSrc,
  },
  girl: {
    paddling: surfPuchiGirlPaddlingSrc,
    standing: surfPuchiGirlStandingSrc,
  },
} as const;
