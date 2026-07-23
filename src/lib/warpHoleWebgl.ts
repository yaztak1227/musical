import {
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  WebGLRenderer,
} from "three";

type WarpHoleColor = readonly [number, number, number];

export type WarpHolePalette = readonly WarpHoleColor[];

type UpdateControlledUniform<T> = { value: T; needsUpdate?: boolean };

const bandCount = 20;
const historyTextureWidth = bandCount / 4;
const historyFrameCount = 32;
const shaderColorCount = 6;
const activeRenderIntervalMs = 1000 / 30;
const reducedMotionRenderIntervalMs = 1000 / 18;
const idleRenderIntervalMs = 1000 / 15;
const historyCaptureIntervalMs = 55;
const maximumPixelRatio = 1;
const bandEdges = [
  0, 0.004, 0.008, 0.012, 0.018, 0.025, 0.035, 0.05, 0.068, 0.095, 0.13,
  0.18, 0.235, 0.31, 0.395, 0.5, 0.57, 0.62, 0.66, 0.69, 0.72,
] as const;
const fallbackWarpHoleColor: WarpHoleColor = [99, 230, 255];

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
  uniform sampler2D uBandHistory;
  uniform float uBands[20];
  uniform vec3 uColors[6];
  uniform float uReducedMotion;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uTransient;

  const float PI = 3.141592653589793;
  const float TAU = 6.283185307179586;
  const int STREAM_FAMILY_COUNT = 8;
  const int FILAMENT_COUNT = 11;
  const int EMITTED_FILAMENT_COUNT = 13;
  const float MAX_OUTPUT_ALPHA = 0.84;
  const float AURORA_RAINBOW_EXPOSURE = 1.65;
  const float AURORA_RAINBOW_BLOOM_STRENGTH = 0.31;
  const float AURORA_RAINBOW_BLOOM_RADIUS = 0.62;
  const float AURORA_RAINBOW_BLOOM_THRESHOLD = 0.34;

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

  float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.58;
    mat2 rotation = mat2(0.83, 0.56, -0.56, 0.83);
    for (int octave = 0; octave < 2; octave++) {
      value += valueNoise(point) * amplitude;
      point = rotation * point * 2.05 + vec2(7.4, 3.8);
      amplitude *= 0.48;
    }
    return value;
  }

  vec3 inputPaletteColor(float progress) {
    float position = clamp(progress, 0.0, 1.0) * 5.0;
    if (position < 1.0) return mix(uColors[0], uColors[1], smoothstep(0.0, 1.0, position));
    if (position < 2.0) return mix(uColors[1], uColors[2], smoothstep(0.0, 1.0, position - 1.0));
    if (position < 3.0) return mix(uColors[2], uColors[3], smoothstep(0.0, 1.0, position - 2.0));
    if (position < 4.0) return mix(uColors[3], uColors[4], smoothstep(0.0, 1.0, position - 3.0));
    return mix(uColors[4], uColors[5], smoothstep(0.0, 1.0, position - 4.0));
  }

  vec3 intrinsicRainbow(float progress) {
    float position = clamp(progress, 0.0, 1.0) * 7.0;
    vec3 rainbowColor;
    if (position < 1.0) {
      rainbowColor = mix(vec3(0.58, 0.96, 0.12), vec3(0.08, 0.82, 0.34), position);
    } else if (position < 2.0) {
      rainbowColor = mix(vec3(0.08, 0.82, 0.34), vec3(0.04, 0.92, 0.72), position - 1.0);
    } else if (position < 3.0) {
      rainbowColor = mix(vec3(0.04, 0.92, 0.72), vec3(0.03, 0.74, 0.98), position - 2.0);
    } else if (position < 4.0) {
      rainbowColor = mix(vec3(0.03, 0.74, 0.98), vec3(0.12, 0.34, 0.98), position - 3.0);
    } else if (position < 5.0) {
      rainbowColor = mix(vec3(0.12, 0.34, 0.98), vec3(0.48, 0.20, 0.96), position - 4.0);
    } else if (position < 6.0) {
      rainbowColor = mix(vec3(0.48, 0.20, 0.96), vec3(0.92, 0.18, 0.78), position - 5.0);
    } else {
      rainbowColor = mix(vec3(0.92, 0.18, 0.78), vec3(0.98, 0.30, 0.55), position - 6.0);
    }
    return mix(rainbowColor, inputPaletteColor(position / 7.0), 0.12);
  }

  vec3 warpColor(float progress) {
    return intrinsicRainbow(progress);
  }

  float signedAngleDistance(float value) {
    return (fract(value / TAU + 0.5) - 0.5) * TAU;
  }

  float historyBlockEnergy(float historyV, int blockIndex) {
    int texelIndex = blockIndex / 4;
    int channelIndex = blockIndex - texelIndex * 4;
    vec4 packedBlocks = texture2D(
      uBandHistory,
      vec2((float(texelIndex) + 0.5) / 5.0, historyV)
    );
    if (channelIndex == 0) return packedBlocks.x;
    if (channelIndex == 1) return packedBlocks.y;
    if (channelIndex == 2) return packedBlocks.z;
    return packedBlocks.w;
  }

  float stridedGroupEnergy(float historyV, int groupIndex) {
    float block0 = historyBlockEnergy(historyV, groupIndex);
    float block1 = historyBlockEnergy(historyV, groupIndex + 5);
    float block2 = historyBlockEnergy(historyV, groupIndex + 10);
    float block3 = historyBlockEnergy(historyV, groupIndex + 15);
    float blockMean = (block0 + block1 + block2 + block3) * 0.25;
    float blockPeak = max(max(block0, block1), max(block2, block3));
    return mix(blockMean, blockPeak, 0.62);
  }

  float stridedGroupRise(float historyV, float olderHistoryV, int groupIndex) {
    float rise0 = clamp((historyBlockEnergy(historyV, groupIndex)
      - historyBlockEnergy(olderHistoryV, groupIndex)) * 9.2, 0.0, 1.0);
    float rise1 = clamp((historyBlockEnergy(historyV, groupIndex + 5)
      - historyBlockEnergy(olderHistoryV, groupIndex + 5)) * 9.2, 0.0, 1.0);
    float rise2 = clamp((historyBlockEnergy(historyV, groupIndex + 10)
      - historyBlockEnergy(olderHistoryV, groupIndex + 10)) * 9.2, 0.0, 1.0);
    float rise3 = clamp((historyBlockEnergy(historyV, groupIndex + 15)
      - historyBlockEnergy(olderHistoryV, groupIndex + 15)) * 9.2, 0.0, 1.0);
    float riseMean = (rise0 + rise1 + rise2 + rise3) * 0.25;
    float risePeak = max(max(rise0, rise1), max(rise2, rise3));
    return mix(riseMean, risePeak, 0.68);
  }

  float stableGroupValue(vec4 groups0To3, float group4, int groupIndex) {
    if (groupIndex == 0) return groups0To3.x;
    if (groupIndex == 1) return groups0To3.y;
    if (groupIndex == 2) return groups0To3.z;
    if (groupIndex == 3) return groups0To3.w;
    return group4;
  }

  vec3 stridedGroupColor(int groupIndex) {
    if (groupIndex == 0) return vec3(0.08, 0.82, 0.34);
    if (groupIndex == 1) return vec3(0.04, 0.92, 0.72);
    if (groupIndex == 2) return vec3(0.03, 0.74, 0.98);
    if (groupIndex == 3) return vec3(0.48, 0.20, 0.96);
    return vec3(0.98, 0.30, 0.55);
  }

  void main() {
    float aspect = uResolution.x / max(1.0, uResolution.y);
    float centerShift = mix(-0.055, -0.068, smoothstep(1.0, 1.5, aspect));
    vec2 point = vec2((vUv.x - 0.5 - centerShift) * aspect, vUv.y - 0.47);
    float radius = length(point);

    if (radius > 1.02) {
      gl_FragColor = vec4(0.0);
      return;
    }

    float angle = atan(point.y, point.x);
    // Keep the angular frequency assignment periodic at atan's +/-PI branch.
    // A wrapped 0..1 ramp creates a visible horizontal seam when band 0 and
    // band 7 have different energy; this sine field still spans all bands but
    // meets continuously on both sides of the branch cut.
    float angularBandPosition = 0.5 + 0.5 * sin(angle - 0.42);
    float bass = max(uBands[0], uBands[1] * 0.78);
    float motion = uTime;
    float holeRadius = 0.027 + bass * 0.005;
    float safeRadius = max(radius, holeRadius);
    float logRadius = log(safeRadius / holeRadius);
    float maximumLogRadius = log(0.94 / holeRadius);
    float perspectiveDepth = clamp(logRadius / maximumLogRadius, 0.0, 1.0);
    float foreground = pow(perspectiveDepth, 0.72);
    // The outer wall reads the newest audio row while the aperture reads the
    // oldest. Shifting the fixed history texture therefore pulls every onset
    // inward through the logarithmic tunnel without additional geometry.
    float historyAge = (1.0 - perspectiveDepth) * 31.0;
    float historyV = (historyAge + 0.5) / 32.0;
    float olderHistoryV = (min(31.0, historyAge + 1.35) + 0.5) / 32.0;
    vec4 groupEnergies = vec4(
      stridedGroupEnergy(historyV, 0),
      stridedGroupEnergy(historyV, 1),
      stridedGroupEnergy(historyV, 2),
      stridedGroupEnergy(historyV, 3)
    );
    float groupEnergy4 = stridedGroupEnergy(historyV, 4);
    vec4 groupRises = vec4(
      stridedGroupRise(historyV, olderHistoryV, 0),
      stridedGroupRise(historyV, olderHistoryV, 1),
      stridedGroupRise(historyV, olderHistoryV, 2),
      stridedGroupRise(historyV, olderHistoryV, 3)
    );
    float groupRise4 = stridedGroupRise(historyV, olderHistoryV, 4);
    float historyActivity = (dot(groupEnergies, vec4(1.0)) + groupEnergy4) * 0.2;
    float historyRise = (dot(groupRises, vec4(1.0)) + groupRise4) * 0.2;
    float holeMask = smoothstep(holeRadius * 0.9, holeRadius + 0.021, radius);
    float outerMask = 1.0 - smoothstep(0.82, 1.06, radius);
    float fieldMask = holeMask * outerMask;
    float reducedDetail = mix(1.0, 0.38, uReducedMotion);
    vec3 accumulated = vec3(0.0);
    float accumulatedAlpha = 0.0;

    // Log-radius is the tunnel's depth axis. Equal steps are increasingly
    // compressed toward the vanishing point, which provides real perspective.
    float tunnelRotation = angle - logRadius * (1.7 + bass * 0.12) + motion * 0.105;
    float palettePosition = clamp(
      0.08 + vUv.x * 0.7 + foreground * 0.1 + 0.035 * sin(tunnelRotation),
      0.0,
      1.0
    );
    vec3 localColor = warpColor(palettePosition);

    float fogNoise = fbm(vec2(
      cos(angle) * 1.7 + logRadius * 0.72 - motion * 0.035,
      sin(angle) * 1.7 + logRadius * 1.38 + motion * 0.024
    ));
    float fogFold = 0.5 + 0.5 * sin(tunnelRotation * 2.0 + logRadius * 1.35);
    float haze = fieldMask
      * (0.006 + uActivity * 0.009 + historyActivity * 0.018 + historyRise * 0.012)
      * (0.16 + fogNoise * 0.84)
      * (0.32 + fogFold * 0.68)
      * (0.35 + foreground * 0.65)
      * 0.95;
    accumulated += localColor * haze;
    accumulatedAlpha += haze * 0.3;

    // Fourteen nested logarithmic rails remain as a subdued depth scaffold.
    for (int layer = 0; layer < 2; layer++) {
      float layerValue = float(layer);
      int railGroup = int(mod(floor(perspectiveDepth * 5.0)
        + floor(angularBandPosition * 5.0) + float(layer * 2), 5.0));
      float railEnergy = stableGroupValue(groupEnergies, groupEnergy4, railGroup);
      float railRise = stableGroupValue(groupRises, groupRise4, railGroup);
      float ringCoordinate = perspectiveDepth * 14.0
        - angle / TAU * 1.18
        - motion * (0.082 + layerValue * 0.012)
        + layerValue * 0.16
        + sin(angle * 2.0 - logRadius * 0.54) * 0.055
        + sin(angle * 3.0 - logRadius) * railRise * 0.018;
      float ringLocal = abs(fract(ringCoordinate) - 0.5);
      float railExpansion = clamp(railEnergy * 0.24 + railRise * 0.82, 0.0, 1.0);
      float ringCore = exp(-ringLocal * ringLocal
        * mix(4200.0 - foreground * 900.0, 2100.0, railExpansion));
      float ringHalo = exp(-ringLocal * ringLocal
        * mix(420.0 - foreground * 80.0, 250.0, railExpansion));
      float sideFalloff = 0.58 + 0.42 * sin(angle - 0.45 + layerValue * 1.7);
      float ringIntensity = fieldMask
        * (0.12 + foreground * 0.88)
        * (0.48 + sideFalloff * 0.52)
        * (ringCore * (0.026 + railEnergy * 0.07 + railRise * 0.11 + uActivity * 0.006)
          + ringHalo * (0.004 + railEnergy * 0.009 + railRise * 0.016))
        * mix(0.22, 0.09, layerValue);
      vec3 ringColor = warpColor(clamp(
        mix(palettePosition, float(railGroup) * 0.25, 0.12) + layerValue * 0.025,
        0.0,
        1.0
      ));
      accumulated += ringColor * ringIntensity;
      accumulatedAlpha += ringIntensity * 0.34;
    }

    float nearBandMask = fieldMask * smoothstep(0.018, 0.18, perspectiveDepth);
    float nearestFamilyPhase = PI;
    float nearestFamilyDistance = 10.0;
    float nearestFamilyWidth = 0.012;
    vec3 nearestFamilyColor = warpColor(0.0);
    float nearestFamilyEnergy = 0.0;

    // Broad curtains carry eleven long strands each. Every parent, strand,
    // and emitted line owns a stable low-to-high strided frequency group.
    for (int family = 0; family < STREAM_FAMILY_COUNT; family++) {
      float familyValue = float(family);
      float familySeed = hash11(familyValue * 4.173 + 0.37);
      float edgeEntry = -3.72
        + familyValue * 0.79
        + sin(familyValue * 1.91 + 0.4) * 0.38
        + (familySeed - 0.5) * 0.62;
      float curvature = 3.72 + familySeed * 2.85 + familyValue * 0.09;
      float depthGain = 0.54 + 0.46 * hash11(familyValue * 7.91 + 2.4);
      float familySweep = (1.0 - perspectiveDepth) * (curvature + bass * (0.08 + familySeed * 0.18))
        + motion * (0.045 + familyValue * 0.011)
        + sin(logRadius * (0.42 + familySeed * 0.23) + familyValue * 1.7) * 0.09;
      float familyPhase = signedAngleDistance(angle - (edgeEntry + familySweep));
      float familyDistance = abs(familyPhase) * max(radius, holeRadius * 1.25);
      int familyGroup = int(mod(float(family * 2 + 1), 5.0));
      float familyEnergy = stableGroupValue(groupEnergies, groupEnergy4, familyGroup);
      float familyRise = stableGroupValue(groupRises, groupRise4, familyGroup);
      float familyWidth = mix(0.0024 + familySeed * 0.0016, 0.01 + familySeed * 0.011, foreground)
        * (0.88 + depthGain * 0.18 + familyEnergy * 0.1 + familyRise * 0.16);
      float familyTexture = 0.94 + 0.06 * sin(
        logRadius * (1.35 + familySeed * 1.1) - motion * (0.035 + familyValue * 0.008)
          + fogNoise * 1.4 + familyValue * 1.73
      );
      float familyCrossDistance = familyPhase * max(radius, holeRadius * 1.25);
      float curtainLean = familyWidth * (0.65 + familySeed * 1.2) * sin(
        logRadius * (1.05 + familySeed * 0.7) - motion * 0.04 + familyValue * 2.13
      );
      float curtainDistance = abs(familyCrossDistance - curtainLean);
      float shoulderDirection = mix(-1.0, 1.0, step(0.5, hash11(familyValue * 3.17 + 9.4)));
      float shoulderOffset = shoulderDirection * familyWidth * (2.1 + familySeed * 2.8);
      float shoulderDistance = abs(familyCrossDistance - curtainLean - shoulderOffset);
      float curtainVeil = exp(-curtainDistance / max(0.0065, familyWidth * (3.0 + familySeed * 2.0)))
        * (0.04 + familyEnergy * 0.065 + familyRise * 0.095 + fogNoise * 0.018);
      float curtainShoulder = exp(-shoulderDistance / max(0.0038, familyWidth * (1.5 + familySeed * 1.5)))
        * (0.018 + familyEnergy * 0.035 + familyRise * 0.055 + fogNoise * 0.009);
      float haloDriver = clamp(max(familyEnergy, familyRise * 1.18), 0.0, 1.0);
      float haloGate = smoothstep(AURORA_RAINBOW_BLOOM_THRESHOLD, 1.0, haloDriver);
      float haloWidth = max(
        0.009,
        familyWidth * mix(2.4, 4.2, AURORA_RAINBOW_BLOOM_RADIUS)
      );
      float curtainHalo = exp(-curtainDistance / haloWidth)
        * haloGate
        * AURORA_RAINBOW_BLOOM_STRENGTH
        * (0.07 + familyEnergy * 0.1 + familyRise * 0.12);
      float continuousCore = exp(-familyDistance / max(0.0007, familyWidth * (0.27 + familySeed * 0.12)))
        * (0.095 + familyEnergy * 0.19 + familyRise * 0.32 + uActivity * 0.018);
      vec3 familyColor = warpColor(fract(
        familyValue / 8.0 + perspectiveDepth * 0.15 + familySeed * 0.045 + familyPhase * 0.018
      ));
      float familyEnvelope = nearBandMask
        * (0.27 + foreground * 0.73)
        * mix(0.68, 1.24, depthGain)
        * familyTexture;
      float familyLight = (curtainVeil + curtainShoulder + curtainHalo + continuousCore)
        * familyEnvelope
        * 0.82;
      float strandCommonWander = sin(
        logRadius * (1.18 + familySeed * 0.52)
          - motion * (0.72 + familySeed * 0.28)
          + familyValue * 1.37
      );

      for (int filament = 0; filament < FILAMENT_COUNT; filament++) {
        float filamentValue = float(filament) - 5.0;
        float filamentSeed = hash11(familyValue * 19.31 + float(filament) * 7.17 + 2.4);
        int filamentGroup = int(mod(float(family * 2 + filament * 3), 5.0));
        float filamentEnergy = stableGroupValue(groupEnergies, groupEnergy4, filamentGroup);
        float filamentRise = stableGroupValue(groupRises, groupRise4, filamentGroup);
        float strandMotionScale = mix(1.0, 0.34, uReducedMotion);
        float longWander = sin(
          logRadius * (1.55 + filamentSeed * 0.65)
            - motion * (0.9 + filamentSeed * 0.35)
            + familyValue * 1.43 + float(filament) * 0.91
        );
        float fineFlutter = sin(
          logRadius * (3.8 + filamentSeed * 1.6)
            + motion * (1.3 + filamentSeed * 0.5)
            + familyValue * 2.17 - float(filament) * 1.37
        );
        float bundleWander = mix(strandCommonWander, longWander, 0.32);
        float audioWander = filamentEnergy * 0.38 + filamentRise * 1.15;
        float filamentOffset = (
          curtainLean
            + filamentValue * familyWidth * (0.235 + filamentSeed * 0.03)
            + familyWidth * strandMotionScale
              * (bundleWander * (0.25 + audioWander * 0.28)
                + fineFlutter * (0.07 + filamentEnergy * 0.11 + filamentRise * 0.2))
        ) / max(radius, holeRadius * 1.25);
        float filamentDistance = abs(familyPhase - filamentOffset)
          * max(radius, holeRadius * 1.25);
        float strandCore = exp(-filamentDistance / max(0.00048, familyWidth * 0.075));
        float strandHalo = exp(-filamentDistance / max(0.001, familyWidth * 0.18));
        float strandRadiance = strandCore
          * (0.065 + filamentEnergy * 0.17 + filamentRise * 0.42)
          + strandHalo * (0.008 + filamentEnergy * 0.032 + filamentRise * 0.085);
        float strandLight = strandRadiance * familyEnvelope;
        vec3 strandColor = mix(
          familyColor,
          stridedGroupColor(filamentGroup),
          0.18
        );
        accumulated += strandColor * strandLight;
        accumulatedAlpha += strandLight * 0.48;
      }

      for (int emitted = 0; emitted < EMITTED_FILAMENT_COUNT; emitted++) {
        float emittedValue = float(emitted);
        float emitterCoordinate = perspectiveDepth * (34.0 + familySeed * 11.0)
          - motion * (0.055 + familyValue * 0.004)
          + emittedValue * 0.271;
        float emitterCell = floor(emitterCoordinate);
        float emitterLocal = fract(emitterCoordinate) - 0.5;
        float emittedSeed = hash11(
          emitterCell * 5.713 + familyValue * 17.17 + emittedValue * 9.41
        );
        int emittedGroup = int(mod(float(family * 3 + emitted * 2 + 1), 5.0));
        float emittedEnergy = stableGroupValue(groupEnergies, groupEnergy4, emittedGroup);
        float emittedRise = stableGroupValue(groupRises, groupRise4, emittedGroup);
        float emittedDriver = clamp(emittedEnergy * 0.32 + emittedRise * 1.12, 0.0, 1.0);
        float emittedSignalGate = smoothstep(0.025, 0.11, emittedEnergy + emittedRise * 2.0);
        float emittedThreshold = mix(0.985, 0.3, emittedDriver);
        float emittedPresence = step(emittedThreshold, emittedSeed);
        float emittedDirection = mix(
          -1.0,
          1.0,
          step(0.5, hash11(emittedSeed * 31.7 + emittedValue * 2.3))
        );
        float emittedRoot = curtainLean
          + (emittedSeed - 0.5) * familyWidth * (0.5 + familySeed * 0.45);
        float emittedAcross = (familyCrossDistance - emittedRoot) * emittedDirection;
        float emittedLength = (0.007 + emittedEnergy * 0.05 + emittedRise * 0.15)
          * (0.76 + emittedSeed * 0.62)
          * (0.55 + foreground * 0.45)
          * reducedDetail;
        float emittedProgress = clamp(emittedAcross / max(0.001, emittedLength), 0.0, 1.0);
        float emittedSegment = step(0.0, emittedAcross)
          * (1.0 - smoothstep(emittedLength * 0.84, emittedLength, emittedAcross));
        float emittedSlope = mix(-0.34, 0.34, emittedSeed);
        float emittedLineDistance = abs(
          emitterLocal * (0.026 + familySeed * 0.01) - emittedAcross * emittedSlope
        );
        float emittedTaper = mix(0.00092, 0.0001, emittedProgress);
        float emittedLine = exp(-emittedLineDistance / max(0.000075, emittedTaper))
          * emittedSegment
          * emittedPresence
          * emittedSignalGate
          * (0.03 + emittedEnergy * 0.09 + emittedRise * 0.26)
          * familyEnvelope;
        vec3 emittedColor = mix(familyColor, vec3(0.9), 0.08 + emittedRise * 0.05);
        accumulated += emittedColor * emittedLine;
        accumulatedAlpha += emittedLine * 0.32;
      }

      accumulated += familyColor * familyLight;
      accumulatedAlpha += familyLight * 0.46;
      if (familyDistance < nearestFamilyDistance) {
        nearestFamilyPhase = familyPhase;
        nearestFamilyDistance = familyDistance;
        nearestFamilyWidth = familyWidth;
        nearestFamilyColor = familyColor;
        nearestFamilyEnergy = clamp(familyEnergy + familyRise * 1.4, 0.0, 1.0);
      }
    }

    // Thin audio spikes grow perpendicular to the particle river. Each radial
    // cell samples a stable frequency band, so no per-frame allocation is used.
    float spikeCoordinate = perspectiveDepth * 29.0 - motion * 0.038;
    float spikeCell = floor(spikeCoordinate);
    float spikeLocal = abs(fract(spikeCoordinate) - 0.5);
    float spikeSeed = hash11(spikeCell * 1.731 + 8.2);
    int spikeGroup = int(mod(abs(spikeCell), 5.0));
    float spikeEnergy = stableGroupValue(groupEnergies, groupEnergy4, spikeGroup);
    float spikeRise = stableGroupValue(groupRises, groupRise4, spikeGroup);
    float spikePresence = step(
      mix(0.975, 0.86, clamp(spikeEnergy * 0.4 + spikeRise * 0.92, 0.0, 1.0)),
      spikeSeed
    );
    float spikeLength = (0.075 + spikeEnergy * 0.28 + spikeRise * 0.52 + uTransient * 0.04)
      * reducedDetail
      * (0.45 + foreground * 0.55);
    float spikeAcross = 1.0 - smoothstep(0.012, spikeLength, abs(nearestFamilyPhase));
    float spikeLine = exp(-spikeLocal * spikeLocal * 480.0);
    float spike = spikeLine
      * spikeAcross
      * spikePresence
      * nearBandMask
      * (0.09 + spikeEnergy * 0.19 + spikeRise * 0.34 + nearestFamilyEnergy * 0.08 + uTransient * 0.03)
      * (0.3 + foreground * 0.7);
    accumulated += mix(nearestFamilyColor, vec3(0.9), 0.08) * spike * 0.22;
    accumulatedAlpha += spike * 0.18;

    vec2 particleSpace = vec2(
      perspectiveDepth * 27.0 - motion * (0.42 + bass * 0.22),
      nearestFamilyPhase * (7.0 + foreground * 11.0)
    );
    vec2 particleCell = floor(particleSpace);
    vec2 particleLocal = fract(particleSpace) - 0.5;
    float particleSeed = hash21(particleCell + vec2(11.7, 29.3));
    vec2 particleOffset = vec2(
      hash21(particleCell + vec2(3.1, 17.4)),
      hash21(particleCell + vec2(23.8, 5.6))
    ) - 0.5;
    int particleGroup = int(mod(abs(particleCell.x + particleCell.y * 2.0), 5.0));
    float particleEnergy = stableGroupValue(groupEnergies, groupEnergy4, particleGroup);
    float particleRise = stableGroupValue(groupRises, groupRise4, particleGroup);
    float particleDance = sin(
      motion * (2.1 + particleSeed * 2.2) + particleSeed * 41.0 + historyAge * 0.18
    );
    particleLocal -= particleOffset * (0.54 + particleRise * 0.2);
    particleLocal.y -= particleDance * (0.045 + particleRise * 0.19) * reducedDetail;
    float emission = clamp(
      0.04 + particleEnergy * 0.3 + particleRise * 0.94 + nearestFamilyEnergy * 0.2 + historyRise * 0.18,
      0.0,
      1.0
    );
    float particlePresence = step(
      mix(0.99, 0.91, emission),
      particleSeed
    );
    float particlePoint = exp(-dot(particleLocal, particleLocal) * 44.0);
    vec2 tailDirection = normalize(vec2(-1.0, (particleSeed - 0.5) * 1.15));
    float tailAlong = dot(particleLocal, tailDirection);
    float tailAcross = abs(dot(particleLocal, vec2(-tailDirection.y, tailDirection.x)));
    float particleTail = exp(-tailAcross * 52.0)
      * exp(-max(0.0, tailAlong) * 7.0)
      * exp(-max(0.0, -tailAlong) * 34.0)
      * (0.025 + particleEnergy * 0.12 + particleRise * 0.78);
    float scatterWidth = 0.2
      + particleEnergy * 0.15
      + particleRise * 0.62
      + historyRise * 0.16;
    float particleEnvelope = nearBandMask
      * exp(-abs(nearestFamilyPhase) / max(0.055, scatterWidth * 0.7));
    float twinkle = 0.85 + 0.15
      * sin(motion * (1.8 + particleSeed * 3.1) + particleSeed * 37.0);
    float particleBase = particlePresence
      * particleEnvelope
      * twinkle
      * (0.28 + foreground * 0.72)
      * reducedDetail;
    float sparkIntensity = particlePoint
      * particleBase
      * (0.7 + particleEnergy * 1.04 + particleRise * 1.72 + uTransient * 0.06)
      * 0.23;
    float tailIntensity = particleTail
      * particleBase
      * (0.22 + particleEnergy * 0.48 + particleRise * 1.16)
      * 0.17;
    vec3 particleColor = warpColor(clamp(
      mix(palettePosition, float(particleGroup) * 0.25, 0.32) + particleSeed * 0.055,
      0.0,
      1.0
    ));
    particleColor = mix(particleColor, nearestFamilyColor, 0.66);
    accumulated += mix(particleColor, vec3(0.92), 0.24 + particleSeed * 0.12)
      * sparkIntensity;
    accumulated += particleColor * tailIntensity;
    accumulatedAlpha += sparkIntensity * 0.25 + tailIntensity * 0.14;

    // Sparse background stars establish scale without an extra draw call.
    vec2 starSpace = point * vec2(94.0, 78.0) + vec2(motion * 0.32, -motion * 0.18);
    vec2 starCell = floor(starSpace);
    vec2 starLocal = fract(starSpace) - 0.5;
    float starSeed = hash21(starCell + vec2(71.2, 9.6));
    vec2 starOffset = vec2(
      hash21(starCell + vec2(1.7, 31.1)),
      hash21(starCell + vec2(19.4, 4.8))
    ) - 0.5;
    starLocal -= starOffset * 0.62;
    float starPoint = exp(-dot(starLocal, starLocal) * 104.0);
    int starGroup = int(mod(abs(starCell.x * 2.0 + starCell.y), 5.0));
    float starEnergy = stableGroupValue(groupEnergies, groupEnergy4, starGroup);
    float starRise = stableGroupValue(groupRises, groupRise4, starGroup);
    float starPresence = step(
      mix(0.995, 0.94, clamp(starEnergy * 0.34 + starRise * 1.2, 0.0, 1.0)),
      starSeed
    );
    float starEnvelope = outerMask
      * (1.0 - smoothstep(0.0, nearestFamilyWidth * 5.0, nearestFamilyDistance))
      * (0.34 + foreground * 0.66);
    float starTwinkle = 0.48 + 0.52 * sin(motion * (0.8 + starSeed * 2.2) + starSeed * 41.0);
    float starIntensity = starPoint
      * starPresence
      * starEnvelope
      * starTwinkle
      * (0.22 + starEnergy * 0.46 + starRise * 1.04 + uTransient * 0.04)
      * reducedDetail
      * 0.2;
    vec3 starColor = warpColor(clamp(0.12 + starSeed * 0.72, 0.0, 1.0));
    accumulated += mix(starColor, vec3(0.92), 0.22) * starIntensity;
    accumulatedAlpha += starIntensity * 0.16;

    // The far aperture remains nearly black while a very thin broken rim
    // anchors every rail at the same distant vanishing point.
    float apertureDistance = abs(radius - holeRadius * 1.28);
    float apertureBreakup = 0.52 + 0.48 * sin(angle * 5.0 + motion * 0.17 + fogNoise * 2.0);
    float aperture = (exp(-apertureDistance * 360.0) * (0.09 + bass * 0.28)
      + exp(-apertureDistance * 76.0) * (0.012 + bass * 0.04))
      * apertureBreakup;
    accumulated += warpColor(clamp(palettePosition * 0.44 + 0.08, 0.0, 1.0)) * aperture;
    accumulatedAlpha += aperture * 0.38;

    accumulated *= 0.7 + outerMask * 0.3;
    accumulated = vec3(1.0) - exp(-accumulated * AURORA_RAINBOW_EXPOSURE);
    float luminance = dot(accumulated, vec3(0.2126, 0.7152, 0.0722));
    accumulated = mix(vec3(luminance), accumulated, 1.1);
    float shadowAlpha = (1.0 - smoothstep(holeRadius * 0.38, holeRadius + 0.014, radius))
      * (0.16 + bass * 0.07);
    float alpha = clamp(
      shadowAlpha + accumulatedAlpha * 1.06 + max(max(accumulated.r, accumulated.g), accumulated.b) * 0.64,
      0.0,
      MAX_OUTPUT_ALPHA
    );
    // NormalBlending expects straight alpha. The shader accumulates radiance in
    // premultiplied form, so un-premultiply once to avoid dimming it a second time.
    vec3 displayColor = alpha > 0.0001 ? accumulated / alpha : vec3(0.0);
    gl_FragColor = vec4(clamp(displayColor, 0.0, 0.88), alpha);
  }
`;

function paletteColor(palette: WarpHolePalette, index: number): WarpHoleColor {
  if (palette.length === 0) return fallbackWarpHoleColor;
  return palette[Math.max(0, Math.min(palette.length - 1, index))] ?? fallbackWarpHoleColor;
}

function averageBand(values: Uint8Array, startProgress: number, endProgress: number) {
  if (values.length === 0) return 0;
  const start = Math.min(values.length - 1, Math.floor(values.length * startProgress));
  const end = Math.max(start + 1, Math.min(values.length, Math.floor(values.length * endProgress)));
  let total = 0;
  for (let index = start; index < end; index += 1) total += values[index] ?? 0;
  return total / Math.max(1, end - start) / 255;
}

function smoothValue(current: number, target: number, attack: number, release: number) {
  return current + (target - current) * (target > current ? attack : release);
}

export class WarpHoleWebGLVisualizer {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: OrthographicCamera;
  private readonly geometry: PlaneGeometry;
  private readonly material: ShaderMaterial;
  private readonly bandUniform = new Float32Array(bandCount);
  private readonly historyBuffer = new Uint8Array(historyFrameCount * bandCount);
  private readonly historyTexture: DataTexture;
  private readonly rawBandScratch = new Float32Array(bandCount);
  private readonly previousRawBands = new Float32Array(bandCount);
  private readonly paletteChannels = new Float64Array(shaderColorCount * 3);
  private readonly resizeObserver: ResizeObserver;
  private canvasWidth: number;
  private canvasHeight: number;
  private appliedPixelRatio: number;
  private activity = 0;
  private transient = 0;
  private visualTime = 0;
  private lastFrameTime = Number.NaN;
  private nextHistoryCaptureAt = Number.NEGATIVE_INFINITY;
  private nextRenderAt = Number.NEGATIVE_INFINITY;
  private hasAudioFrame = false;
  private hasPalette = false;
  private wasActive = false;
  private lastScheduleWasActive: boolean | null = null;
  private lastScheduleReducedMotion: boolean | null = null;
  private sizeChanged = false;
  private bandsNeedUpload = true;
  private paletteNeedsUpload = true;

  private readonly handleContextRestored = () => {
    this.nextRenderAt = Number.NEGATIVE_INFINITY;
    this.sizeChanged = true;
    this.bandsNeedUpload = true;
    this.paletteNeedsUpload = true;
    this.historyTexture.needsUpdate = true;
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
    this.historyTexture = new DataTexture(
      this.historyBuffer,
      historyTextureWidth,
      historyFrameCount,
      RGBAFormat,
      UnsignedByteType,
    );
    this.historyTexture.generateMipmaps = false;
    this.historyTexture.magFilter = LinearFilter;
    this.historyTexture.minFilter = LinearFilter;
    this.historyTexture.needsUpdate = true;
    this.material = new ShaderMaterial({
      blending: NormalBlending,
      depthTest: false,
      depthWrite: false,
      fragmentShader,
      toneMapped: false,
      transparent: true,
      uniforms: {
        uActivity: { value: 0 },
        uBandHistory: { value: this.historyTexture },
        uBands: { value: this.bandUniform },
        uColors: { value: Array.from({ length: shaderColorCount }, () => new Color()) },
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

  private updateAudio(values: Uint8Array, isActive: boolean) {
    if (!isActive) {
      if (this.wasActive || this.hasAudioFrame) {
        this.bandUniform.fill(0);
        this.rawBandScratch.fill(0);
        this.previousRawBands.fill(0);
        this.historyBuffer.fill(0);
        this.historyTexture.needsUpdate = true;
        this.activity = 0;
        this.transient = 0;
        this.nextHistoryCaptureAt = Number.NEGATIVE_INFINITY;
        this.hasAudioFrame = false;
        this.wasActive = false;
        this.bandsNeedUpload = true;
      }
      return;
    }

    let energySquares = 0;
    let positiveDelta = 0;
    for (let band = 0; band < bandCount; band += 1) {
      const rawEnergy = averageBand(values, bandEdges[band] ?? 0, bandEdges[band + 1] ?? 1);
      const previousEnergy = this.previousRawBands[band] ?? 0;
      if (this.hasAudioFrame) positiveDelta += Math.max(0, rawEnergy - previousEnergy);
      this.rawBandScratch[band] = rawEnergy;
      this.previousRawBands[band] = rawEnergy;
      const current = this.bandUniform[band] ?? 0;
      const next = smoothValue(current, rawEnergy, 0.46, 0.13);
      if (next !== current) this.bandsNeedUpload = true;
      this.bandUniform[band] = next;
      energySquares += rawEnergy * rawEnergy;
    }

    const targetActivity = Math.min(1, Math.sqrt(energySquares / bandCount) * 1.34);
    const targetTransient = Math.min(1, (positiveDelta / bandCount) * 7.2);
    this.activity = smoothValue(this.activity, targetActivity, 0.31, 0.08);
    this.transient = smoothValue(this.transient, targetTransient, 0.57, 0.072);
    this.hasAudioFrame = true;
    this.wasActive = true;
  }

  private recordAudioHistory() {
    // Five RGBA texels hold all twenty blocks for one frame. The fixed 32-row
    // byte texture avoids large fragment-uniform arrays and
    // shifts in-place without allocating on the animation path.
    this.historyBuffer.copyWithin(
      bandCount,
      0,
      this.historyBuffer.length - bandCount,
    );
    for (let band = 0; band < bandCount; band += 1) {
      const energy = Math.max(0, Math.min(
        1,
        (this.rawBandScratch[band] ?? 0) * 0.72 + (this.bandUniform[band] ?? 0) * 0.28,
      ));
      this.historyBuffer[band] = Math.round(energy * 255);
    }
    this.historyTexture.needsUpdate = true;
  }

  private updatePalette(palette: WarpHolePalette) {
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

  private updateVisualTime(time: number, reducedMotion: boolean, isActive: boolean) {
    if (!Number.isFinite(this.lastFrameTime)) {
      this.lastFrameTime = time;
      return;
    }
    const elapsedSeconds = Math.max(0, Math.min(0.1, (time - this.lastFrameTime) * 0.001));
    const bass = Math.max(this.bandUniform[0] ?? 0, (this.bandUniform[1] ?? 0) * 0.78);
    const activeSpeed = isActive ? 0.42 + bass * 1.16 : 0.07;
    const reducedScale = reducedMotion ? 0.18 : 1;
    this.visualTime += elapsedSeconds * activeSpeed * reducedScale;
    this.lastFrameTime = time;
  }

  render(
    values: Uint8Array,
    time: number,
    palette: WarpHolePalette,
    reducedMotion: boolean,
    isActive = true,
  ) {
    this.updateSize();
    this.updateAudio(values, isActive);
    this.updatePalette(palette);
    this.updateVisualTime(time, reducedMotion, isActive);

    this.material.uniforms.uActivity!.value = this.activity;
    this.material.uniforms.uReducedMotion!.value = reducedMotion ? 1 : 0;
    this.material.uniforms.uTime!.value = this.visualTime;
    this.material.uniforms.uTransient!.value = reducedMotion ? this.transient * 0.25 : this.transient;

    if (
      this.lastScheduleWasActive !== isActive
      || this.lastScheduleReducedMotion !== reducedMotion
      || time + 100 < this.nextRenderAt
    ) {
      this.nextRenderAt = Number.NEGATIVE_INFINITY;
      this.lastScheduleWasActive = isActive;
      this.lastScheduleReducedMotion = reducedMotion;
    }
    const renderInterval = !isActive
      ? idleRenderIntervalMs
      : reducedMotion
        ? reducedMotionRenderIntervalMs
        : activeRenderIntervalMs;
    if (time < this.nextRenderAt) return;
    this.nextRenderAt = time + renderInterval;
    if (isActive) {
      if (!Number.isFinite(this.nextHistoryCaptureAt)) this.nextHistoryCaptureAt = time;
      if (time >= this.nextHistoryCaptureAt) {
        this.recordAudioHistory();
        this.nextHistoryCaptureAt += historyCaptureIntervalMs;
        if (this.nextHistoryCaptureAt <= time - historyCaptureIntervalMs) {
          this.nextHistoryCaptureAt = time + historyCaptureIntervalMs;
        }
      }
    }

    const bandsUniform = this.material.uniforms.uBands as UpdateControlledUniform<Float32Array>;
    const colorsUniform = this.material.uniforms.uColors as UpdateControlledUniform<Color[]>;
    bandsUniform.needsUpdate = this.bandsNeedUpload;
    colorsUniform.needsUpdate = this.paletteNeedsUpload;
    this.renderer.render(this.scene, this.camera);
    this.bandsNeedUpload = false;
    this.paletteNeedsUpload = false;
    bandsUniform.needsUpdate = false;
    colorsUniform.needsUpdate = false;
  }

  reset() {
    this.bandUniform.fill(0);
    this.rawBandScratch.fill(0);
    this.previousRawBands.fill(0);
    this.historyBuffer.fill(0);
    this.historyTexture.needsUpdate = true;
    this.activity = 0;
    this.transient = 0;
    this.visualTime = 0;
    this.lastFrameTime = Number.NaN;
    this.nextHistoryCaptureAt = Number.NEGATIVE_INFINITY;
    this.nextRenderAt = Number.NEGATIVE_INFINITY;
    this.hasAudioFrame = false;
    this.wasActive = false;
    this.lastScheduleWasActive = null;
    this.lastScheduleReducedMotion = null;
    this.bandsNeedUpload = true;
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.geometry.dispose();
    this.historyTexture.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
