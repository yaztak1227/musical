import {
  Color,
  Mesh,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from "three";

type HelixColor = readonly [number, number, number];

export type HelixPalette = readonly HelixColor[];
export type HelixAudioBands = readonly number[] | Float32Array | Uint8Array;
export type HelixWebGLRenderFrame = {
  audioBands?: HelixAudioBands;
  audioFrequencyData: Uint8Array;
  isActive?: boolean;
  motionScale?: number;
  palette: HelixPalette;
  reducedMotion?: boolean;
  time: number;
};

type UpdateControlledUniform<T> = { value: T; needsUpdate?: boolean };

const bandCount = 8;
const historyFrameCount = 32;
const shaderColorCount = 8;
const captureIntervalMs = 58;
const activeRenderIntervalMs = 1000 / 30;
const reducedMotionRenderIntervalMs = 1000 / 18;
const idleRenderIntervalMs = 1000 / 15;
const maximumPixelRatio = 1;
const bandEdges = [0, 0.012, 0.025, 0.05, 0.095, 0.18, 0.31, 0.5, 0.72] as const;
const fallbackHelixColor: HelixColor = [99, 230, 255];

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec2 vUv;
  uniform float uActivity;
  uniform float uBands[8];
  uniform vec3 uColors[8];
  uniform float uHistory[256];
  uniform float uHistoryActivity[32];
  uniform float uReducedMotion;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uTransient;

  const float PI = 3.141592653589793;
  const float TAU = 6.283185307179586;
  const int HELIX_LAYER_COUNT = 3;
  const int STRAND_FILAMENT_COUNT = 6;
  const int RUNG_FILAMENT_COUNT = 3;
  const float MAX_OUTPUT_ALPHA = 0.84;
  const float MAX_OUTPUT_CHANNEL = 0.88;

  float hash11(float value) {
    value = fract(value * 0.1031);
    value *= value + 33.33;
    value *= value + value;
    return fract(value);
  }

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  float fbm3(vec2 point) {
    float noise = valueNoise(point) * 0.57;
    point = mat2(1.62, 1.18, -1.18, 1.62) * point + vec2(4.7, 8.3);
    noise += valueNoise(point) * 0.29;
    point = mat2(1.54, 1.27, -1.27, 1.54) * point + vec2(9.1, 2.6);
    noise += valueNoise(point) * 0.14;
    return noise;
  }

  float fbm2(vec2 point) {
    float noise = valueNoise(point) * 0.66;
    point = mat2(1.62, 1.18, -1.18, 1.62) * point + vec2(4.7, 8.3);
    noise += valueNoise(point) * 0.34;
    return noise;
  }

  vec3 helixColor(float progress) {
    float position = clamp(progress, 0.0, 0.9999) * 7.0;
    if (position < 1.0) return mix(uColors[0], uColors[1], smoothstep(0.0, 1.0, position));
    if (position < 2.0) return mix(uColors[1], uColors[2], smoothstep(0.0, 1.0, position - 1.0));
    if (position < 3.0) return mix(uColors[2], uColors[3], smoothstep(0.0, 1.0, position - 2.0));
    if (position < 4.0) return mix(uColors[3], uColors[4], smoothstep(0.0, 1.0, position - 3.0));
    if (position < 5.0) return mix(uColors[4], uColors[5], smoothstep(0.0, 1.0, position - 4.0));
    if (position < 6.0) return mix(uColors[5], uColors[6], smoothstep(0.0, 1.0, position - 5.0));
    return mix(uColors[6], uColors[7], smoothstep(0.0, 1.0, position - 6.0));
  }

  float spatialColorProgress(float x, float progress, float layoutScale) {
    float visibleHalfWidth = 0.78 * layoutScale + 0.32;
    return clamp(
      0.5 + x / max(0.2, visibleHalfWidth * 2.0) + (progress - 0.5) * 0.035,
      0.0,
      1.0
    );
  }

  float frequencyEnergy(float progress) {
    float position = clamp(progress, 0.0, 0.9999) * 7.0;
    if (position < 1.0) return mix(uBands[0], uBands[1], position);
    if (position < 2.0) return mix(uBands[1], uBands[2], position - 1.0);
    if (position < 3.0) return mix(uBands[2], uBands[3], position - 2.0);
    if (position < 4.0) return mix(uBands[3], uBands[4], position - 3.0);
    if (position < 5.0) return mix(uBands[4], uBands[5], position - 4.0);
    if (position < 6.0) return mix(uBands[5], uBands[6], position - 5.0);
    return mix(uBands[6], uBands[7], position - 6.0);
  }

  float historyFrequencyEnergy(int rowIndex, float progress) {
    float position = clamp(progress, 0.0, 0.9999) * 7.0;
    int firstBand = int(floor(position));
    int secondBand = min(7, firstBand + 1);
    int rowOffset = rowIndex * 8;
    return mix(
      uHistory[rowOffset + firstBand],
      uHistory[rowOffset + secondBand],
      fract(position)
    );
  }

  float historyFrequencyRise(int rowIndex, float progress) {
    int previousRowIndex = max(0, rowIndex - 1);
    float position = clamp(progress, 0.0, 0.9999) * 7.0;
    int firstBand = int(floor(position));
    int secondBand = min(7, firstBand + 1);
    int rowOffset = rowIndex * 8;
    int previousRowOffset = previousRowIndex * 8;
    float currentEnergy = mix(
      uHistory[rowOffset + firstBand],
      uHistory[rowOffset + secondBand],
      fract(position)
    );
    float previousEnergy = mix(
      uHistory[previousRowOffset + firstBand],
      uHistory[previousRowOffset + secondBand],
      fract(position)
    );
    return max(0.0, currentEnergy - previousEnergy);
  }

  void main() {
    float aspect = uResolution.x / max(1.0, uResolution.y);
    vec2 point = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);
    float layoutScale = clamp(aspect / 1.42, 0.62, 1.0);
    float bottom = -0.53;
    float top = 0.53;
    float helixProgress = clamp((point.y - bottom) / (top - bottom), 0.0, 1.0);
    float verticalMask = smoothstep(bottom, bottom + 0.055, point.y)
      * (1.0 - smoothstep(top - 0.055, top, point.y));

    if (verticalMask <= 0.0 || abs(point.x) > 0.78 * layoutScale + 0.32) {
      gl_FragColor = vec4(0.0);
      return;
    }

    float rowCoordinate = helixProgress * 31.0;
    float rowNumber = floor(rowCoordinate + 0.5);
    float rowProgress = rowNumber / 31.0;
    float rowDistance = abs(helixProgress - rowProgress) * (top - bottom);
    float rowDelta = point.y - mix(bottom, top, rowProgress);
    int historyIndex = int(clamp(floor((1.0 - rowProgress) * 31.0 + 0.5), 0.0, 31.0));
    float historyActivity = uHistoryActivity[historyIndex];
    float bassEnergy = frequencyEnergy(0.08);
    float midEnergy = frequencyEnergy(0.46);
    float currentTreble = frequencyEnergy(0.82);
    int previousHistoryIndex = max(0, historyIndex - 1);
    float historyActivityRise = max(
      0.0,
      historyActivity - uHistoryActivity[previousHistoryIndex]
    );
    float motion = uTime;
    float pixelSize = 1.0 / max(1.0, uResolution.y);
    vec3 accumulated = vec3(0.0);
    float accumulatedAlpha = 0.0;
    float centralCenter = 0.0;
    float centralRadius = 0.172 * layoutScale;
    float sharedColorProgress = spatialColorProgress(point.x, helixProgress, layoutScale);

    // Two low-frequency flow fields create broad, translucent curtains instead
    // of a flat halo. They are shared by every helix to keep the shader cheap.
    vec2 fogPoint = vec2(
      point.y * 3.65 - motion * 0.055,
      point.x * 3.05 + sin(point.y * 5.1 + motion * 0.08) * 0.24
    );
    float fogLarge = fbm3(fogPoint);
    float fogFine = fbm2(fogPoint * 2.08 + vec2(6.7, -motion * 0.035));
    float fogFilaments = pow(
      clamp(1.0 - abs(fogFine * 2.0 - 1.0), 0.0, 1.0),
      3.4
    );

    float cyanVeil = exp(-abs(point.x + 0.29 * layoutScale) * 2.15);
    float violetVeil = exp(-abs(point.x - 0.34 * layoutScale) * 2.05);
    float curtainBody = (0.28 + fogLarge * 0.72 + fogFilaments * 0.46)
      * (0.105 + uActivity * 0.08 + midEnergy * 0.055)
      * mix(1.0, 0.72, uReducedMotion)
      * verticalMask;
    accumulated += helixColor(sharedColorProgress - 0.025) * curtainBody * cyanVeil;
    accumulated += helixColor(sharedColorProgress + 0.035) * curtainBody * violetVeil;
    accumulatedAlpha += curtainBody * (cyanVeil + violetVeil) * 0.28;

    // A handful of analytic flow paths adds visible smoke ribbons without a
    // texture lookup or another render pass. Reusing the two fog fields keeps
    // neighboring ribbons coherent instead of looking like separate halos.
    for (int veil = 0; veil < 4; veil++) {
      float veilValue = float(veil);
      float veilSide = mod(veilValue, 2.0) * 2.0 - 1.0;
      float veilLane = floor(veilValue * 0.5);
      float veilPath = veilSide * (0.16 + veilLane * 0.21) * layoutScale
        + sin(point.y * (4.1 + veilLane * 0.9) + veilValue * 1.7 + motion * 0.055)
          * (0.075 + veilLane * 0.026)
        + sin(point.y * 10.3 - veilValue * 2.1 - motion * 0.038) * 0.022;
      float veilDistance = abs(point.x - veilPath);
      float veilRidge = exp(-veilDistance * (13.0 + veilLane * 2.0));
      float veilFilament = exp(-veilDistance * (48.0 + veilLane * 8.0));
      float veilNoise = clamp(fogLarge * 0.52 + fogFine * 0.32 + fogFilaments * 0.46, 0.0, 1.0);
      float veilIntensity = (
        veilRidge * (0.055 + veilNoise * 0.13)
          + veilFilament * (0.035 + fogFilaments * 0.12)
      )
        * mix(1.0, 0.72, uReducedMotion)
        * verticalMask;
      vec3 veilColor = helixColor(spatialColorProgress(veilPath, helixProgress, layoutScale));
      accumulated += veilColor * veilIntensity;
      accumulatedAlpha += veilIntensity * 0.36;
    }

    for (int layer = 0; layer < HELIX_LAYER_COUNT; layer++) {
      float layerValue = float(layer);
      float centerWeight = 1.0 - abs(layerValue - 1.0);
      float baseCenter = (layerValue - 1.0) * 0.47 * layoutScale;
      float layerReach = mix(0.41, 0.48, centerWeight) * layoutScale + 0.02;
      if (abs(point.x - baseCenter) > layerReach) continue;
      float axisSway = sin(helixProgress * TAU * 0.82 + motion * 0.075 + layerValue * 0.24) * 0.026
        + sin(helixProgress * TAU * 1.73 - motion * 0.046 + layerValue) * 0.009;
      float rowAxisSway = sin(rowProgress * TAU * 0.82 + motion * 0.075 + layerValue * 0.24) * 0.026
        + sin(rowProgress * TAU * 1.73 - motion * 0.046 + layerValue) * 0.009;
      float center = baseCenter + axisSway;
      float rowCenter = baseCenter + rowAxisSway;
      float radius = mix(0.12, 0.172, centerWeight) * layoutScale;
      float opacity = mix(0.5, 1.0, centerWeight);
      float turns = mix(2.72, 3.18, centerWeight);
      float layerPhase = (layerValue - 1.0) * 1.16;
      float phase = helixProgress * TAU * turns - motion * mix(0.3, 0.48, centerWeight) + layerPhase;
      float rowPhase = rowProgress * TAU * turns - motion * mix(0.3, 0.48, centerWeight) + layerPhase;
      float breathing = 0.95 + sin(helixProgress * PI * 2.0 + motion * 0.18 + layerPhase) * 0.05;
      float strandOffset = sin(phase) * radius * breathing;
      float rowOffset = sin(rowPhase) * radius
        * (0.95 + sin(rowProgress * PI * 2.0 + motion * 0.18 + layerPhase) * 0.05);
      float firstX = center + strandOffset;
      float secondX = center - strandOffset;
      float rowFirstX = rowCenter + rowOffset;
      float rowSecondX = rowCenter - rowOffset;
      float firstDistance = abs(point.x - firstX);
      float secondDistance = abs(point.x - secondX);
      float strandDistance = min(firstDistance, secondDistance);
      float firstDepth = 0.5 + 0.5 * cos(phase);
      float secondDepth = 1.0 - firstDepth;

      if (layer == 1) {
        centralCenter = center;
        centralRadius = radius;
      }

      // Wide flowing sheets follow both strands; narrow folded filaments give
      // them the gauzy, smoke-like depth of the reference artwork.
      float localFog = clamp(
        fogLarge * 0.68
          + fogFine * 0.24
          + sin(point.y * 17.0 + layerPhase + motion * 0.07) * 0.08,
        0.0,
        1.0
      );
      float sideFade = 1.0 - smoothstep(radius * 1.08, radius * 2.7 + 0.12, abs(point.x - center));
      float strandMist = exp(-strandDistance * mix(10.0, 13.0, centerWeight));
      float interiorMist = exp(-abs(point.x - center) / max(0.04, radius * 1.36)) * sideFade;
      float ribbonFold = pow(
        clamp(1.0 - abs(sin((point.x - center) * 13.0 + phase * 0.38 + localFog * 2.4)), 0.0, 1.0),
        5.0
      );
      float firstSheet = exp(-firstDistance * mix(17.0, 22.0, centerWeight))
        * (0.28 + firstDepth * 0.72);
      float secondSheet = exp(-secondDistance * mix(17.0, 22.0, centerWeight))
        * (0.28 + secondDepth * 0.72);
      float mist = (
        strandMist * (0.34 + localFog * 0.86 + ribbonFold * 0.52)
          + interiorMist * (0.2 + fogFilaments * 0.38)
      )
        * (0.15 + uActivity * 0.18 + historyActivity * 0.13)
        * opacity
        * mix(1.0, 0.7, uReducedMotion);

      float firstColorProgress = clamp(
        0.5 + (firstX - center) / max(0.04, radius * 2.16) + (helixProgress - 0.5) * 0.035,
        0.0,
        1.0
      );
      float secondColorProgress = clamp(
        0.5 + (secondX - center) / max(0.04, radius * 2.16) + (helixProgress - 0.5) * 0.035,
        0.0,
        1.0
      );
      vec3 firstColor = helixColor(firstColorProgress);
      vec3 secondColor = helixColor(secondColorProgress);
      vec3 mistColor = mix(firstColor, secondColor, 0.46 + 0.28 * sin(phase));
      accumulated += mistColor * mist;
      float sheetIntensity = (0.035 + localFog * 0.09 + fogFilaments * 0.055)
        * opacity
        * mix(1.0, 0.72, uReducedMotion);
      accumulated += firstColor * firstSheet * sheetIntensity;
      accumulated += secondColor * secondSheet * sheetIntensity;
      accumulatedAlpha += mist * 0.3;
      accumulatedAlpha += (firstSheet + secondSheet) * sheetIntensity * 0.22;

      // Each backbone is a bundle of independently wandering hairs rather than
      // one wide neon rail. Stable seeds keep the hairs continuous while two
      // motion scales produce the slow drift and fine aurora flutter.
      float firstHairBundle = 0.0;
      float secondHairBundle = 0.0;
      for (int filament = 0; filament < STRAND_FILAMENT_COUNT; filament++) {
        float filamentValue = float(filament);
        float filamentSeed = hash11(layerValue * 31.7 + filamentValue * 9.13 + 4.6);
        float lane = (filamentValue - 2.5) / 2.5;
        float filamentBandProgress = clamp(
          (filamentValue + layerValue * 1.7) / 9.4,
          0.0,
          1.0
        );
        float filamentEnergy = historyFrequencyEnergy(historyIndex, filamentBandProgress);
        float filamentRise = clamp(
          historyFrequencyRise(historyIndex, filamentBandProgress) * 7.2,
          0.0,
          1.0
        );
        float laneSpread = lane * mix(0.008, 0.013, centerWeight)
          * mix(0.78, 1.18, filamentSeed);
        float longWander = sin(
          helixProgress * TAU * mix(1.45, 2.8, filamentSeed)
            + layerPhase
            + filamentSeed * 17.0
            + motion * mix(0.052, 0.11, filamentSeed)
        ) * mix(0.0018, 0.0046, filamentSeed)
          * (0.82 + filamentEnergy * 0.42 + filamentRise * 0.55);
        float fineFlutter = sin(
          helixProgress * TAU * mix(7.0, 13.0, filamentSeed)
            - motion * mix(0.12, 0.27, filamentSeed)
            + filamentSeed * 43.0
        ) * mix(0.00045, 0.00145, filamentSeed)
          * mix(1.0, 0.28, uReducedMotion);
        float firstHairX = firstX + laneSpread + longWander + fineFlutter;
        float secondHairX = secondX - laneSpread
          + longWander * (filamentSeed * 0.42 - 0.2)
          - fineFlutter;
        float hairWidth = mix(690.0, 1040.0, filamentSeed)
          / (1.0 + pixelSize * 68.0);
        float hairWeight = mix(0.48, 0.84, filamentSeed)
          * (0.62 + filamentEnergy * 0.52 + filamentRise * 0.62);
        firstHairBundle += exp(-abs(point.x - firstHairX) * hairWidth) * hairWeight;
        secondHairBundle += exp(-abs(point.x - secondHairX) * hairWidth) * hairWeight;
      }
      firstHairBundle *= 0.76 * (0.3 + firstDepth * 0.7);
      secondHairBundle *= 0.76 * (0.3 + secondDepth * 0.7);
      float firstGlow = exp(-firstDistance * mix(36.0, 51.0, centerWeight)) * (0.25 + firstDepth * 0.75);
      float secondGlow = exp(-secondDistance * mix(36.0, 51.0, centerWeight)) * (0.25 + secondDepth * 0.75);
      float strandIntensity = (0.27 + uActivity * 0.43 + historyActivity * 0.31)
        * opacity
        * (0.78 + localFog * 0.22)
        * mix(1.0, 0.9, centerWeight);
      accumulated += firstColor * (firstHairBundle + firstGlow * 0.12) * strandIntensity;
      accumulated += secondColor * (secondHairBundle + secondGlow * 0.12) * strandIntensity;
      accumulatedAlpha += (firstHairBundle + secondHairBundle + (firstGlow + secondGlow) * 0.045)
        * strandIntensity * 0.42;

      float minimumX = min(rowFirstX, rowSecondX);
      float maximumX = max(rowFirstX, rowSecondX);
      float strandSpan = max(0.008, maximumX - minimumX);
      float withinRung = smoothstep(-pixelSize * 2.0, pixelSize * 1.5, point.x - minimumX)
        * smoothstep(-pixelSize * 2.0, pixelSize * 1.5, maximumX - point.x);
      float rungProgress = clamp((point.x - minimumX) / strandSpan, 0.0, 1.0);
      float bandEnergy = historyFrequencyEnergy(historyIndex, rungProgress);
      float bandRise = layer == 1
        ? clamp(historyFrequencyRise(historyIndex, rungProgress) * 5.2, 0.0, 1.0)
        : 0.0;
      float rungHairBundle = 0.0;
      for (int filament = 0; filament < RUNG_FILAMENT_COUNT; filament++) {
        float filamentValue = float(filament);
        float rungFilamentSeed = hash11(rowNumber * 13.7 + layerValue * 7.1 + filamentValue * 19.3);
        float rungLane = filamentValue - 1.0;
        float rungFlutter = sin(
          rungProgress * TAU * mix(2.2, 5.4, rungFilamentSeed)
            + rowNumber * 0.37
            + motion * mix(0.06, 0.18, rungFilamentSeed)
        ) * mix(0.00035, 0.0011, rungFilamentSeed)
          * mix(1.0, 0.3, uReducedMotion);
        float rungOffsetY = rungLane * pixelSize * mix(0.7, 1.25, rungFilamentSeed) + rungFlutter;
        float rungWidth = mix(520.0, 760.0, rungFilamentSeed)
          / (1.0 + pixelSize * 42.0);
        rungHairBundle += exp(-abs(rowDelta - rungOffsetY) * rungWidth)
          * mix(0.5, 0.84, rungFilamentSeed);
      }
      float rungLine = rungHairBundle * withinRung;
      float rungGlow = exp(-rowDistance * mix(82.0, 146.0, centerWeight)) * withinRung;
      float rungSeed = hash11(rowNumber * 9.73 + layerValue * 17.4);
      float rungVariation = mix(0.34, 1.0, smoothstep(0.28, 0.78, rungSeed + bandEnergy * 0.24));
      float rungIntensity = rungLine
        * (0.13 + bandEnergy * 0.94 + historyActivity * 0.32)
        * opacity
        * rungVariation
        * mix(1.0, 0.66, uReducedMotion);
      vec3 rungColor = helixColor(clamp(rungProgress + (rowProgress - 0.5) * 0.035, 0.0, 1.0));
      accumulated += rungColor * (rungIntensity + rungGlow * rungIntensity * 0.1);
      accumulatedAlpha += rungIntensity * 0.46;

      if (layer == 1) {
        // Every history row represents one moment in time. A positive change
        // in its frequency band starts between the DNA pair, travels upward
        // with the history, and expands sideways as a thin, gauzy wavefront.
        // New history enters at the bottom and rises toward the top.
        float eventAge = rowProgress;
        float distanceFromPair = abs(point.x - rowCenter);
        float waveRadius = 0.018 + eventAge * (0.25 + historyActivity * 0.08);
        float waveRowEnvelope = exp(-rowDistance * 260.0);
        float waveRowHalo = exp(-rowDistance * 42.0);
        // Invert the wave travel: for this fragment, find the two positions
        // inside the rung that could have emitted it to the left or right.
        // Their fixed 0..1 positions map directly to the eight frequency bands,
        // so a mid-band onset keeps its own origin after leaving the DNA pair.
        float leftSourceProgress = (point.x + waveRadius - minimumX) / strandSpan;
        float rightSourceProgress = (point.x - waveRadius - minimumX) / strandSpan;
        float leftSourceGate = smoothstep(-0.025, 0.015, leftSourceProgress)
          * (1.0 - smoothstep(0.985, 1.025, leftSourceProgress));
        float rightSourceGate = smoothstep(-0.025, 0.015, rightSourceProgress)
          * (1.0 - smoothstep(0.985, 1.025, rightSourceProgress));
        leftSourceProgress = clamp(leftSourceProgress, 0.0, 1.0);
        rightSourceProgress = clamp(rightSourceProgress, 0.0, 1.0);
        float leftSourceRise = pow(clamp(
          historyFrequencyRise(historyIndex, leftSourceProgress) * 10.4,
          0.0,
          1.0
        ), 0.72) * leftSourceGate;
        float rightSourceRise = pow(clamp(
          historyFrequencyRise(historyIndex, rightSourceProgress) * 10.4,
          0.0,
          1.0
        ), 0.72) * rightSourceGate;
        float leftBandCell = abs(fract(leftSourceProgress * 7.0 + 0.5) - 0.5);
        float rightBandCell = abs(fract(rightSourceProgress * 7.0 + 0.5) - 0.5);
        float leftWaveProfile = exp(-leftBandCell * leftBandCell * 174.0)
          + exp(-leftBandCell * leftBandCell * 4.2) * 0.3;
        float rightWaveProfile = exp(-rightBandCell * rightBandCell * 174.0)
          + exp(-rightBandCell * rightBandCell * 4.2) * 0.3;
        float waveTrail = exp(-distanceFromPair * 4.4)
          * (1.0 - smoothstep(waveRadius * 0.78, waveRadius * 1.08, distanceFromPair));
        float waveFilament = 0.48 + fogFilaments * 0.42
          + 0.1 * sin(point.x * 62.0 - motion * 0.34 + rowProgress * 23.0);
        float waveBase = (0.38 + historyActivity * 0.78)
          * (waveRowEnvelope + waveRowHalo * 0.16)
          * waveFilament
          * mix(1.0, 0.22, uReducedMotion);
        float leftWaveIntensity = leftSourceRise * leftWaveProfile * waveBase;
        float rightWaveIntensity = rightSourceRise * rightWaveProfile * waveBase;
        float trailDriver = clamp(
          historyActivityRise * 2.2
            + max(leftSourceRise, rightSourceRise) * 0.3,
          0.0,
          1.0
        );
        float trailIntensity = waveTrail
          * trailDriver
          * (waveRowEnvelope * 0.38 + waveRowHalo * 0.15)
          * (0.38 + historyActivity * 0.4)
          * mix(1.0, 0.22, uReducedMotion);
        accumulated += helixColor(clamp(leftSourceProgress * 0.94 + 0.03, 0.0, 1.0))
          * leftWaveIntensity;
        accumulated += helixColor(clamp(rightSourceProgress * 0.94 + 0.03, 0.0, 1.0))
          * rightWaveIntensity;
        accumulated += helixColor(spatialColorProgress(point.x, rowProgress, layoutScale)) * trailIntensity;
        float waveIntensity = leftWaveIntensity + rightWaveIntensity + trailIntensity;
        accumulatedAlpha += waveIntensity * 0.38;

        // The closest rung endpoint emits a small seeded fan. Frequency history
        // rises now control its reach, so each band has its own brief sparkle.
        float useSecondNode = step(abs(point.x - rowSecondX), abs(point.x - rowFirstX));
        float nodeX = mix(rowFirstX, rowSecondX, useSecondNode);
        vec2 rayPoint = point - vec2(nodeX, mix(bottom, top, rowProgress));
        float radialDistance = length(rayPoint);
        float burstSeed = hash11(rowNumber * 17.31 + useSecondNode * 11.7 + 8.7);
        float burstEnergy = historyActivity * 0.22
          + bandEnergy * 0.18
          + bandRise * 0.92
          + historyActivityRise * 2.2
          + uTransient * 0.22;
        float rayReach = 0.065 + burstEnergy * 0.155;
        float rayEnvelope = exp(-radialDistance / max(0.012, rayReach))
          * (1.0 - smoothstep(rayReach * 0.8, rayReach * 1.7, radialDistance));
        float rayFan = 0.0;
        float rayLimit = 0.24 + clamp(burstEnergy, 0.0, 1.0) * 0.12;
        if (radialDistance < rayLimit) {
          for (int ray = 0; ray < 4; ray++) {
            float rayValue = float(ray);
            float rayAngle = (hash11(burstSeed * 31.7 + rayValue * 9.13) - 0.5) * 2.05
              + step(0.5, useSecondNode) * PI;
            vec2 direction = vec2(cos(rayAngle), sin(rayAngle));
            float forward = dot(rayPoint, direction);
            float lineDistance = abs(rayPoint.x * direction.y - rayPoint.y * direction.x);
            float line = exp(-lineDistance * (250.0 + rayValue * 34.0))
              * smoothstep(-0.004, 0.012, forward);
            rayFan += line * (0.58 + hash11(rayValue * 5.4 + burstSeed) * 0.42);
          }
        }
        float rayGate = smoothstep(0.56, 0.8, burstSeed + burstEnergy * 0.38);
        float rayIntensity = rayFan * rayEnvelope * rayGate
          * (0.12 + burstEnergy * 0.68)
          * mix(1.0, 0.3, uReducedMotion);
        float nodeCore = exp(-radialDistance * 245.0);
        float nodeGlow = exp(-radialDistance * 47.0);
        float nodeIntensity = (nodeCore + nodeGlow * 0.2)
          * (0.14 + bandEnergy * 0.82 + historyActivity * 0.24);
        vec3 burstColor = helixColor(mix(0.04, 0.96, useSecondNode));
        accumulated += burstColor * (rayIntensity + nodeIntensity);
        accumulatedAlpha += rayIntensity * 0.3 + nodeIntensity * 0.42;
      }
    }

    // One procedural particle grid is reused for all eight bands. Each cell is
    // assigned a stable band, then advected away from the central DNA only as
    // that band's positive history delta passes its vertical position.
    float particleDrift = motion * mix(0.3, 0.07, uReducedMotion);
    float outwardDirection = point.x < centralCenter ? -1.0 : 1.0;
    vec2 particleSpace = vec2(
      (point.x - centralCenter - outwardDirection * particleDrift * 0.026) * 42.0,
      (point.y - particleDrift * 0.013) * 48.0
    );
    vec2 particleCell = floor(particleSpace);
    vec2 particleLocal = fract(particleSpace) - 0.5;
    float particleSeed = hash21(particleCell + vec2(13.7, 4.1));
    vec2 particleOffset = vec2(
      hash21(particleCell + vec2(2.3, 19.1)),
      hash21(particleCell + vec2(31.7, 7.9))
    ) - 0.5;
    particleLocal -= particleOffset * 0.66;
    float particleBandProgress = hash11(particleSeed * 37.1 + 4.7);
    float particleBandEnergy = historyFrequencyEnergy(historyIndex, particleBandProgress);
    float particleBandRise = clamp(
      historyFrequencyRise(historyIndex, particleBandProgress) * 5.8,
      0.0,
      1.0
    );
    float particleEvent = clamp(
      particleBandRise + historyActivityRise * 2.4,
      0.0,
      1.0
    );
    float particlePresence = step(
      0.77 - uActivity * 0.04 - particleEvent * 0.11,
      particleSeed
    );
    float particlePoint = exp(-dot(particleLocal, particleLocal) * 39.0);
    float particleStreak = exp(-abs(particleLocal.y) * 57.0)
      * exp(-abs(particleLocal.x) * 6.2)
      * smoothstep(
        0.9,
        0.998,
        particleSeed + particleEvent * 0.1 + uTransient * 0.035
      );
    float particleAge = rowProgress;
    float particleSourceX = centralCenter
      + (particleBandProgress - 0.5) * centralRadius * 1.82;
    float particleDistance = abs(point.x - particleSourceX);
    float particleFlowRadius = 0.018 + particleAge * 0.4;
    float particleFlowFront = exp(-abs(particleDistance - particleFlowRadius) * 7.4);
    float particleFlowTrail = exp(-particleDistance * 2.7)
      * (1.0 - smoothstep(particleFlowRadius * 0.8, particleFlowRadius * 1.55 + 0.08, particleDistance));
    float particleEnvelope = (particleFlowFront * (0.44 + particleEvent * 0.72)
        + particleFlowTrail * (0.28 + particleBandEnergy * 0.38))
      * (0.34 + fogLarge * 0.38 + verticalMask * 0.28)
      * (1.0 - smoothstep(0.66, 1.05, particleDistance));
    float twinkle = 0.72 + 0.28 * sin(motion * (1.5 + particleSeed * 2.7) + particleSeed * 31.0);
    float particleIntensity = (particlePoint + particleStreak * (
        0.24 + particleEvent * 0.44 + uTransient * 0.25
      ))
      * particlePresence
      * particleEnvelope
      * twinkle
      * (0.34
        + uActivity * 0.24
        + particleBandEnergy * 0.38
        + particleEvent * 0.96
        + currentTreble * 0.08
        + uTransient * 0.12)
      * mix(1.0, 0.34, uReducedMotion);
    accumulated += helixColor(clamp(particleBandProgress * 0.94 + 0.03, 0.0, 1.0)) * particleIntensity;
    accumulatedAlpha += particleIntensity * 0.54;

    float atmosphere = exp(-abs(point.x) * 2.1)
      * verticalMask
      * (0.018 + fogLarge * 0.03 + fogFilaments * 0.026)
      * (0.46 + bassEnergy * 0.26 + uActivity * 0.28);
    accumulated += helixColor(sharedColorProgress) * atmosphere;
    accumulatedAlpha += atmosphere * 0.22;

    accumulated *= verticalMask;
    accumulated = vec3(1.0) - exp(-accumulated * 1.78);
    float luminance = dot(accumulated, vec3(0.2126, 0.7152, 0.0722));
    accumulated = mix(vec3(luminance), accumulated, 1.18);
    float peak = max(max(accumulated.r, accumulated.g), accumulated.b);
    float floorChannel = min(min(accumulated.r, accumulated.g), accumulated.b);
    float neutrality = smoothstep(0.58, 0.94, floorChannel / max(0.0001, peak));
    float highlightLimit = mix(MAX_OUTPUT_CHANNEL, 0.78, neutrality);
    float highlightCompression = smoothstep(highlightLimit * 0.82, highlightLimit, peak);
    float peakScale = min(peak, highlightLimit) / max(0.0001, peak);
    accumulated *= mix(1.0, peakScale, highlightCompression);
    float alpha = clamp(
      accumulatedAlpha * verticalMask + max(max(accumulated.r, accumulated.g), accumulated.b) * 0.52,
      0.0,
      MAX_OUTPUT_ALPHA
    );
    gl_FragColor = vec4(clamp(accumulated, 0.0, MAX_OUTPUT_CHANNEL), alpha);
  }
`;

function paletteColor(palette: HelixPalette, index: number): HelixColor {
  if (palette.length === 0) return fallbackHelixColor;
  return palette[Math.max(0, Math.min(palette.length - 1, index))] ?? fallbackHelixColor;
}

function averageBand(values: Uint8Array, startProgress: number, endProgress: number) {
  if (values.length === 0) return 0;
  const start = Math.min(values.length - 1, Math.floor(values.length * startProgress));
  const end = Math.max(start + 1, Math.min(values.length, Math.floor(values.length * endProgress)));
  let total = 0;
  for (let index = start; index < end; index += 1) total += values[index] ?? 0;
  return total / Math.max(1, end - start) / 255;
}

function normalizeAudioBand(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value > 1 ? value / 255 : value));
}

function sampleProvidedBand(values: HelixAudioBands, progress: number) {
  if (values.length === 0) return 0;
  if (values.length === 1) return normalizeAudioBand(values[0] ?? 0);
  const position = Math.max(0, Math.min(values.length - 1, progress * (values.length - 1)));
  const firstIndex = Math.floor(position);
  const secondIndex = Math.min(values.length - 1, firstIndex + 1);
  const amount = position - firstIndex;
  const first = normalizeAudioBand(values[firstIndex] ?? 0);
  const second = normalizeAudioBand(values[secondIndex] ?? first);
  return first + (second - first) * amount;
}

function smoothValue(current: number, target: number, attack: number, release: number) {
  return current + (target - current) * (target > current ? attack : release);
}

export class FrequencyHelixWebGLVisualizer {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: OrthographicCamera;
  private readonly geometry: PlaneGeometry;
  private readonly material: ShaderMaterial;
  private readonly bandUniform = new Float32Array(bandCount);
  private readonly rawBandScratch = new Float32Array(bandCount);
  private readonly previousRawBands = new Float32Array(bandCount);
  private readonly historyUniform = new Float32Array(historyFrameCount * bandCount);
  private readonly historyActivityUniform = new Float32Array(historyFrameCount);
  private readonly paletteChannels = new Float64Array(shaderColorCount * 3);
  private readonly resizeObserver: ResizeObserver;
  private canvasWidth: number;
  private canvasHeight: number;
  private appliedPixelRatio: number;
  private activity = 0;
  private transient = 0;
  private visualTime = 0;
  private lastFrameTime = Number.NaN;
  private lastCapturedAt = Number.NEGATIVE_INFINITY;
  private nextRenderAt = Number.NEGATIVE_INFINITY;
  private hasAudioFrame = false;
  private hasHistory = false;
  private hasPalette = false;
  private wasActive = false;
  private sizeChanged = false;
  private historyNeedsUpload = true;
  private bandsNeedUpload = true;
  private paletteNeedsUpload = true;

  private readonly handleContextRestored = () => {
    this.nextRenderAt = Number.NEGATIVE_INFINITY;
    this.sizeChanged = true;
    this.historyNeedsUpload = true;
    this.bandsNeedUpload = true;
    this.paletteNeedsUpload = true;
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.canvasWidth = Math.max(1, canvas.clientWidth);
    this.canvasHeight = Math.max(1, canvas.clientHeight);
    this.appliedPixelRatio = Math.min(window.devicePixelRatio || 1, maximumPixelRatio);
    this.renderer = new WebGLRenderer({
      alpha: true,
      antialias: false,
      canvas,
      depth: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(this.appliedPixelRatio);
    this.renderer.setSize(this.canvasWidth, this.canvasHeight, false);

    const targetWidth = Math.floor(this.canvasWidth * this.appliedPixelRatio);
    const targetHeight = Math.floor(this.canvasHeight * this.appliedPixelRatio);
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.geometry = new PlaneGeometry(2, 2);
    this.material = new ShaderMaterial({
      blending: NormalBlending,
      depthTest: false,
      depthWrite: false,
      fragmentShader,
      toneMapped: false,
      transparent: true,
      uniforms: {
        uActivity: { value: 0 },
        uBands: { value: this.bandUniform },
        uColors: { value: Array.from({ length: shaderColorCount }, () => new Color()) },
        uHistory: { value: this.historyUniform },
        uHistoryActivity: { value: this.historyActivityUniform },
        uReducedMotion: { value: 0 },
        uResolution: { value: new Vector2(targetWidth, targetHeight) },
        uTime: { value: 0 },
        uTransient: { value: 0 },
      },
      vertexShader,
    });
    this.scene.add(new Mesh(this.geometry, this.material));

    this.resizeObserver = new ResizeObserver(() => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      if (width === this.canvasWidth && height === this.canvasHeight) return;
      this.canvasWidth = width;
      this.canvasHeight = height;
      this.sizeChanged = true;
    });
    this.resizeObserver.observe(canvas);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
  }

  private updateSize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, maximumPixelRatio);
    const pixelRatioChanged = pixelRatio !== this.appliedPixelRatio;
    if (!this.sizeChanged && !pixelRatioChanged) return;

    if (pixelRatioChanged) this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.canvasWidth, this.canvasHeight, false);
    (this.material.uniforms.uResolution?.value as Vector2).set(
      Math.floor(this.canvasWidth * pixelRatio),
      Math.floor(this.canvasHeight * pixelRatio),
    );
    this.appliedPixelRatio = pixelRatio;
    this.sizeChanged = false;
  }

  private captureRawBands(audioFrequencyData: Uint8Array, audioBands?: HelixAudioBands) {
    for (let band = 0; band < bandCount; band += 1) {
      this.rawBandScratch[band] = audioBands
        ? sampleProvidedBand(audioBands, band / (bandCount - 1))
        : averageBand(audioFrequencyData, bandEdges[band] ?? 0, bandEdges[band + 1] ?? 1);
    }
  }

  private resetAudio() {
    if (!this.wasActive && !this.hasHistory && !this.hasAudioFrame) return;
    this.bandUniform.fill(0);
    this.rawBandScratch.fill(0);
    this.previousRawBands.fill(0);
    this.historyUniform.fill(0);
    this.historyActivityUniform.fill(0);
    this.activity = 0;
    this.transient = 0;
    this.hasAudioFrame = false;
    this.hasHistory = false;
    this.wasActive = false;
    this.lastCapturedAt = Number.NEGATIVE_INFINITY;
    this.bandsNeedUpload = true;
    this.historyNeedsUpload = true;
  }

  private updateAudio(
    audioFrequencyData: Uint8Array,
    audioBands: HelixAudioBands | undefined,
    time: number,
    reducedMotion: boolean,
    isActive: boolean,
  ) {
    if (!isActive) {
      this.resetAudio();
      return;
    }

    this.captureRawBands(audioFrequencyData, audioBands);
    let energySquares = 0;
    let positiveDelta = 0;
    for (let band = 0; band < bandCount; band += 1) {
      const rawEnergy = this.rawBandScratch[band] ?? 0;
      const previousEnergy = this.previousRawBands[band] ?? 0;
      if (this.hasAudioFrame) positiveDelta += Math.max(0, rawEnergy - previousEnergy);
      this.previousRawBands[band] = rawEnergy;
      const current = this.bandUniform[band] ?? 0;
      const next = smoothValue(current, rawEnergy, 0.46, 0.14);
      if (next !== current) this.bandsNeedUpload = true;
      this.bandUniform[band] = next;
      energySquares += rawEnergy * rawEnergy;
    }

    const targetActivity = Math.min(1, Math.sqrt(energySquares / bandCount) * 1.32);
    const targetTransient = Math.min(1, (positiveDelta / bandCount) * 6.8);
    this.activity = smoothValue(this.activity, targetActivity, 0.32, 0.085);
    this.transient = smoothValue(this.transient, targetTransient, 0.56, 0.075);
    this.hasAudioFrame = true;
    this.wasActive = true;

    const interval = captureIntervalMs * (reducedMotion ? 1.8 : 1);
    if (this.hasHistory && time - this.lastCapturedAt < interval) return;
    if (this.hasHistory) {
      this.historyUniform.copyWithin(0, bandCount);
      this.historyActivityUniform.copyWithin(0, 1);
      const newestFrameOffset = (historyFrameCount - 1) * bandCount;
      for (let band = 0; band < bandCount; band += 1) {
        this.historyUniform[newestFrameOffset + band] = this.rawBandScratch[band] ?? 0;
      }
      this.historyActivityUniform[historyFrameCount - 1] = targetActivity;
    } else {
      for (let frame = 0; frame < historyFrameCount; frame += 1) {
        const frameOffset = frame * bandCount;
        for (let band = 0; band < bandCount; band += 1) {
          this.historyUniform[frameOffset + band] = this.rawBandScratch[band] ?? 0;
        }
      }
      this.historyActivityUniform.fill(targetActivity);
      this.hasHistory = true;
    }
    this.lastCapturedAt = time;
    this.historyNeedsUpload = true;
  }

  private updatePalette(palette: HelixPalette) {
    const colors = this.material.uniforms.uColors?.value as Color[];
    const maxPaletteIndex = Math.max(0, palette.length - 1);
    for (let index = 0; index < shaderColorCount; index += 1) {
      const palettePosition = (index / (shaderColorCount - 1)) * maxPaletteIndex;
      const firstIndex = Math.floor(palettePosition);
      const secondIndex = Math.min(maxPaletteIndex, firstIndex + 1);
      const amount = palettePosition - firstIndex;
      const first = paletteColor(palette, firstIndex);
      const second = paletteColor(palette, secondIndex);
      const red = first[0] + (second[0] - first[0]) * amount;
      const green = first[1] + (second[1] - first[1]) * amount;
      const blue = first[2] + (second[2] - first[2]) * amount;
      const channelOffset = index * 3;
      if (
        this.hasPalette
        && this.paletteChannels[channelOffset] === red
        && this.paletteChannels[channelOffset + 1] === green
        && this.paletteChannels[channelOffset + 2] === blue
      ) continue;

      this.paletteChannels[channelOffset] = red;
      this.paletteChannels[channelOffset + 1] = green;
      this.paletteChannels[channelOffset + 2] = blue;
      colors[index]?.setRGB(red / 255, green / 255, blue / 255);
      this.paletteNeedsUpload = true;
    }
    this.hasPalette = true;
  }

  private updateVisualTime(time: number, reducedMotion: boolean, isActive: boolean, motionScale: number) {
    if (!Number.isFinite(this.lastFrameTime)) {
      this.lastFrameTime = time;
      return;
    }
    const elapsedSeconds = Math.max(0, Math.min(0.1, (time - this.lastFrameTime) * 0.001));
    const activeScale = isActive ? 1 : 0.12;
    const reducedScale = reducedMotion ? 0.18 : 1;
    this.visualTime += elapsedSeconds * activeScale * reducedScale * motionScale;
    this.lastFrameTime = time;
  }

  render(
    audioFrequencyData: Uint8Array,
    time: number,
    palette: HelixPalette,
    reducedMotion: boolean,
    isActive = true,
    motionScale = 1,
    audioBands?: HelixAudioBands,
  ) {
    this.updateSize();
    this.updateAudio(audioFrequencyData, audioBands, time, reducedMotion, isActive);
    this.updatePalette(palette);
    this.updateVisualTime(time, reducedMotion, isActive, Math.max(0, Math.min(2, motionScale)));

    this.material.uniforms.uActivity!.value = this.activity;
    this.material.uniforms.uReducedMotion!.value = reducedMotion ? 1 : 0;
    this.material.uniforms.uTime!.value = this.visualTime;
    this.material.uniforms.uTransient!.value = reducedMotion ? this.transient * 0.28 : this.transient;

    const renderInterval = !isActive
      ? idleRenderIntervalMs
      : reducedMotion
        ? reducedMotionRenderIntervalMs
        : activeRenderIntervalMs;
    if (time < this.nextRenderAt) return;
    this.nextRenderAt = time + renderInterval;

    const bandsUniform = this.material.uniforms.uBands as UpdateControlledUniform<Float32Array>;
    const historyUniform = this.material.uniforms.uHistory as UpdateControlledUniform<Float32Array>;
    const historyActivityUniform = this.material.uniforms.uHistoryActivity as UpdateControlledUniform<Float32Array>;
    const colorsUniform = this.material.uniforms.uColors as UpdateControlledUniform<Color[]>;
    bandsUniform.needsUpdate = this.bandsNeedUpload;
    historyUniform.needsUpdate = this.historyNeedsUpload;
    historyActivityUniform.needsUpdate = this.historyNeedsUpload;
    colorsUniform.needsUpdate = this.paletteNeedsUpload;
    this.renderer.render(this.scene, this.camera);
    this.bandsNeedUpload = false;
    this.historyNeedsUpload = false;
    this.paletteNeedsUpload = false;
    bandsUniform.needsUpdate = false;
    historyUniform.needsUpdate = false;
    historyActivityUniform.needsUpdate = false;
    colorsUniform.needsUpdate = false;
  }

  renderFrame(frame: HelixWebGLRenderFrame) {
    this.render(
      frame.audioFrequencyData,
      frame.time,
      frame.palette,
      frame.reducedMotion ?? false,
      frame.isActive ?? true,
      frame.motionScale ?? 1,
      frame.audioBands,
    );
  }

  reset() {
    this.bandUniform.fill(0);
    this.rawBandScratch.fill(0);
    this.previousRawBands.fill(0);
    this.historyUniform.fill(0);
    this.historyActivityUniform.fill(0);
    this.activity = 0;
    this.transient = 0;
    this.visualTime = 0;
    this.lastFrameTime = Number.NaN;
    this.lastCapturedAt = Number.NEGATIVE_INFINITY;
    this.nextRenderAt = Number.NEGATIVE_INFINITY;
    this.hasAudioFrame = false;
    this.hasHistory = false;
    this.wasActive = false;
    this.bandsNeedUpload = true;
    this.historyNeedsUpload = true;
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}

export { FrequencyHelixWebGLVisualizer as HelixWebGLVisualizer };
