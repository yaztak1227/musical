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

const bandCount = 8;
const historyFrameCount = 32;
const shaderColorCount = 6;
const activeRenderIntervalMs = 1000 / 30;
const reducedMotionRenderIntervalMs = 1000 / 18;
const idleRenderIntervalMs = 1000 / 15;
const historyCaptureIntervalMs = 55;
const maximumPixelRatio = 1;
const bandEdges = [0, 0.012, 0.025, 0.05, 0.095, 0.18, 0.31, 0.5, 0.72] as const;
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
  uniform float uBands[8];
  uniform vec3 uColors[6];
  uniform float uReducedMotion;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uTransient;

  const float PI = 3.141592653589793;
  const float TAU = 6.283185307179586;

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

  // Warp Hole has its own cool spectral identity. The selected visualizer
  // palette remains present as a tint, but cannot turn the tunnel into a
  // broad red or white annulus.
  vec3 warpColor(float progress) {
    float position = clamp(progress, 0.0, 1.0);
    vec3 spectral;
    if (position < 0.28) {
      spectral = mix(vec3(0.025, 0.68, 0.95), vec3(0.055, 0.22, 0.72), position / 0.28);
    } else if (position < 0.62) {
      spectral = mix(vec3(0.055, 0.22, 0.72), vec3(0.38, 0.16, 0.78), (position - 0.28) / 0.34);
    } else if (position < 0.84) {
      spectral = mix(vec3(0.38, 0.16, 0.78), vec3(0.82, 0.18, 0.76), (position - 0.62) / 0.22);
    } else {
      spectral = mix(vec3(0.82, 0.18, 0.76), vec3(0.96, 0.34, 0.68), (position - 0.84) / 0.16);
    }
    return mix(spectral, inputPaletteColor(position), 0.14);
  }

  float signedAngleDistance(float value) {
    return (fract(value / TAU + 0.5) - 0.5) * TAU;
  }

  float historyEnergy(vec4 lowBands, vec4 highBands, float progress) {
    float position = clamp(progress, 0.0, 0.9999) * 7.0;
    if (position < 1.0) return mix(lowBands.x, lowBands.y, position);
    if (position < 2.0) return mix(lowBands.y, lowBands.z, position - 1.0);
    if (position < 3.0) return mix(lowBands.z, lowBands.w, position - 2.0);
    if (position < 4.0) return mix(lowBands.w, highBands.x, position - 3.0);
    if (position < 5.0) return mix(highBands.x, highBands.y, position - 4.0);
    if (position < 6.0) return mix(highBands.y, highBands.z, position - 5.0);
    return mix(highBands.z, highBands.w, position - 6.0);
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
    vec4 historyLow = texture2D(uBandHistory, vec2(0.25, historyV));
    vec4 historyHigh = texture2D(uBandHistory, vec2(0.75, historyV));
    vec4 olderHistoryLow = texture2D(uBandHistory, vec2(0.25, olderHistoryV));
    vec4 olderHistoryHigh = texture2D(uBandHistory, vec2(0.75, olderHistoryV));
    vec4 riseLow = clamp((historyLow - olderHistoryLow) * 9.2, 0.0, 1.0);
    vec4 riseHigh = clamp((historyHigh - olderHistoryHigh) * 9.2, 0.0, 1.0);
    float historyActivity = dot(historyLow + historyHigh, vec4(0.125));
    float historyRise = dot(riseLow + riseHigh, vec4(0.125));
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

    // Fourteen nested logarithmic rails form the cylindrical wall. The second
    // pass is only a hairline echo, so the rails stay distinct instead of
    // merging into an annulus.
    for (int layer = 0; layer < 2; layer++) {
      float layerValue = float(layer);
      float railBandPosition = fract(
        perspectiveDepth * 0.61
          + angularBandPosition * 0.24
          + layerValue * 0.193
      );
      float railEnergy = historyEnergy(historyLow, historyHigh, railBandPosition);
      float railRise = historyEnergy(riseLow, riseHigh, railBandPosition);
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
        * (ringCore * (0.11 + railEnergy * 0.3 + railRise * 0.46 + uActivity * 0.018)
          + ringHalo * (0.011 + railEnergy * 0.026 + railRise * 0.052))
        * mix(1.0, 0.48, layerValue);
      vec3 ringColor = warpColor(clamp(
        mix(palettePosition, railBandPosition, 0.12) + layerValue * 0.025,
        0.0,
        1.0
      ));
      accumulated += ringColor * ringIntensity;
      accumulatedAlpha += ringIntensity * 0.34;
    }

    // Two slender currents enter from opposite lower corners and share the
    // same inward curl. They brighten rail edges without closing into a ring.
    float spiralSweep = (1.0 - perspectiveDepth) * (5.15 + bass * 0.18) + motion * 0.105;
    float mainPhase = signedAngleDistance(angle - (-3.45 + spiralSweep));
    float mainCrossDistance = abs(mainPhase) * max(radius, holeRadius * 1.25);
    float streamBandPosition = fract(
      perspectiveDepth * 0.71 + angularBandPosition * 0.19 + 0.08
    );
    float streamEnergy = historyEnergy(historyLow, historyHigh, streamBandPosition);
    float streamRise = historyEnergy(riseLow, riseHigh, streamBandPosition);
    float bandWidth = mix(0.0026, 0.018, foreground)
      * (1.0 + streamEnergy * 0.26 + streamRise * 0.42 + uTransient * 0.04);
    float bandCore = exp(-mainCrossDistance / max(0.0008, bandWidth * 0.42));
    float bandGlow = exp(-mainCrossDistance / max(0.004, bandWidth * 3.2));
    float nearBandMask = fieldMask * smoothstep(0.04, 0.3, perspectiveDepth);
    float bandTexture = 0.5 + 0.5 * sin(logRadius * 52.0 - motion * 0.25 + fogNoise * 3.0);
    vec3 cyanCurrentColor = warpColor(mix(0.03, 0.55, 1.0 - perspectiveDepth));
    vec3 magentaCurrentColor = warpColor(mix(0.92, 0.61, 1.0 - perspectiveDepth));
    vec3 bandColor = cyanCurrentColor;
    float bandIntensity = nearBandMask
      * (0.18 + foreground * 0.82)
      * (bandCore * (0.52 + streamEnergy * 0.72 + streamRise * 0.92 + uActivity * 0.1)
        + bandGlow * (0.052 + streamEnergy * 0.12 + streamRise * 0.17))
      * (0.74 + bandTexture * 0.26)
      * (0.8 + foreground * 0.3);
    float ribbonHaze = nearBandMask
      * exp(-mainCrossDistance / max(0.012, bandWidth * 3.8))
      * (0.025 + fogNoise * 0.05 + streamEnergy * 0.045 + streamRise * 0.065)
      * (0.2 + foreground * 0.8);
    float beadCoordinate = perspectiveDepth * 76.0 - motion * 0.21;
    float beadCell = floor(beadCoordinate);
    float beadSeed = hash11(beadCell * 2.17 + 3.8);
    float beadLocal = abs(fract(beadCoordinate) - 0.5);
    float beadPresence = step(
      mix(0.78, 0.24, clamp(streamEnergy * 0.46 + streamRise * 1.2, 0.0, 1.0)),
      beadSeed
    );
    float streamBeads = exp(-beadLocal * beadLocal * 510.0)
      * exp(-mainCrossDistance / max(0.001, bandWidth * 0.48))
      * beadPresence
      * nearBandMask
      * (0.18 + streamEnergy * 0.54 + streamRise * 1.08)
      * (0.24 + foreground * 0.76);
    accumulated += bandColor * (bandIntensity + ribbonHaze + streamBeads);
    accumulatedAlpha += bandIntensity * 0.48 + ribbonHaze * 0.26 + streamBeads * 0.5;

    float echoPhase = signedAngleDistance(angle - (-1.78 + spiralSweep));
    float echoDistance = abs(echoPhase) * max(radius, holeRadius * 1.25);
    float echoFan = 1.0 + smoothstep(0.62, 1.0, foreground) * 1.15;
    float echoWidth = bandWidth * echoFan;
    float echoCore = exp(-echoDistance / max(0.0012, echoWidth * 0.36));
    float echoGlow = exp(-echoDistance / max(0.004, echoWidth * 3.0));
    float echoIntensity = nearBandMask
      * (0.15 + foreground * 0.85)
      * (echoCore * (0.38 + streamEnergy * 0.52 + streamRise * 0.72)
        + echoGlow * (0.045 + streamEnergy * 0.075 + streamRise * 0.12))
      * (0.68 + bandTexture * 0.32);
    accumulated += magentaCurrentColor * echoIntensity;
    accumulatedAlpha += echoIntensity * 0.32;

    // Thin audio spikes grow perpendicular to the particle river. Each radial
    // cell samples a stable frequency band, so no per-frame allocation is used.
    float spikeCoordinate = perspectiveDepth * 64.0 - motion * 0.055;
    float spikeCell = floor(spikeCoordinate);
    float spikeLocal = abs(fract(spikeCoordinate) - 0.5);
    float spikeSeed = hash11(spikeCell * 1.731 + 8.2);
    float spikeBandPosition = fract(spikeCell * 0.6180339);
    float spikeEnergy = historyEnergy(historyLow, historyHigh, spikeBandPosition);
    float spikeRise = historyEnergy(riseLow, riseHigh, spikeBandPosition);
    float spikePresence = step(
      mix(0.62, 0.12, clamp(spikeEnergy * 0.5 + spikeRise * 1.22, 0.0, 1.0)),
      spikeSeed
    );
    float spikeLength = (0.075 + spikeEnergy * 0.28 + spikeRise * 0.52 + uTransient * 0.04)
      * reducedDetail
      * (0.45 + foreground * 0.55);
    float closestPhase = abs(mainPhase) < abs(echoPhase) ? mainPhase : echoPhase;
    vec3 closestCurrentColor = abs(mainPhase) < abs(echoPhase)
      ? cyanCurrentColor
      : magentaCurrentColor;
    float spikeAcross = 1.0 - smoothstep(0.012, spikeLength, abs(closestPhase));
    float spikeLine = exp(-spikeLocal * spikeLocal * 480.0);
    float spike = spikeLine
      * spikeAcross
      * spikePresence
      * nearBandMask
      * (0.3 + spikeEnergy * 0.67 + spikeRise * 1.18 + uTransient * 0.12)
      * (0.3 + foreground * 0.7);
    accumulated += mix(closestCurrentColor, vec3(0.9), 0.14) * spike * 0.72;
    accumulatedAlpha += spike * 0.5;

    vec2 particleSpace = vec2(
      perspectiveDepth * 56.0 - motion * (0.68 + bass * 0.36),
      closestPhase * (9.0 + foreground * 15.0)
    );
    vec2 particleCell = floor(particleSpace);
    vec2 particleLocal = fract(particleSpace) - 0.5;
    float particleSeed = hash21(particleCell + vec2(11.7, 29.3));
    vec2 particleOffset = vec2(
      hash21(particleCell + vec2(3.1, 17.4)),
      hash21(particleCell + vec2(23.8, 5.6))
    ) - 0.5;
    float particleBandPosition = fract(
      particleCell.x * 0.6180339 + particleCell.y * 0.173 + particleSeed * 0.11
    );
    float particleEnergy = historyEnergy(historyLow, historyHigh, particleBandPosition);
    float particleRise = historyEnergy(riseLow, riseHigh, particleBandPosition);
    float particleDance = sin(
      motion * (2.1 + particleSeed * 2.2) + particleSeed * 41.0 + historyAge * 0.18
    );
    particleLocal -= particleOffset * (0.54 + particleRise * 0.2);
    particleLocal.y -= particleDance * (0.045 + particleRise * 0.19) * reducedDetail;
    float emission = clamp(
      0.07 + particleEnergy * 0.42 + particleRise * 1.42 + historyRise * 0.3,
      0.0,
      1.0
    );
    float particlePresence = step(
      mix(0.72, 0.1, emission),
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
      * exp(-abs(closestPhase) / max(0.08, scatterWidth));
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
      * 1.18;
    float tailIntensity = particleTail
      * particleBase
      * (0.22 + particleEnergy * 0.48 + particleRise * 1.16)
      * 1.05;
    vec3 particleColor = warpColor(clamp(
      mix(palettePosition, particleBandPosition, 0.32) + particleSeed * 0.055,
      0.0,
      1.0
    ));
    particleColor = mix(particleColor, closestCurrentColor, 0.58);
    accumulated += mix(particleColor, vec3(0.92), 0.24 + particleSeed * 0.12)
      * sparkIntensity;
    accumulated += particleColor * tailIntensity;
    accumulatedAlpha += sparkIntensity * 0.58 + tailIntensity * 0.32;

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
    float starBandPosition = fract(starCell.x * 0.137 + starCell.y * 0.271);
    float starEnergy = historyEnergy(historyLow, historyHigh, starBandPosition);
    float starRise = historyEnergy(riseLow, riseHigh, starBandPosition);
    float starPresence = step(
      mix(0.96, 0.76, clamp(starEnergy * 0.34 + starRise * 1.2, 0.0, 1.0)),
      starSeed
    );
    float starEnvelope = outerMask
      * (1.0 - smoothstep(0.0, bandWidth * 6.0, mainCrossDistance))
      * (0.34 + foreground * 0.66);
    float starTwinkle = 0.48 + 0.52 * sin(motion * (0.8 + starSeed * 2.2) + starSeed * 41.0);
    float starIntensity = starPoint
      * starPresence
      * starEnvelope
      * starTwinkle
      * (0.22 + starEnergy * 0.46 + starRise * 1.04 + uTransient * 0.04)
      * reducedDetail;
    vec3 starColor = warpColor(clamp(0.12 + starSeed * 0.72, 0.0, 1.0));
    accumulated += mix(starColor, vec3(0.92), 0.22) * starIntensity;
    accumulatedAlpha += starIntensity * 0.45;

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
    accumulated = vec3(1.0) - exp(-accumulated * 2.65);
    float luminance = dot(accumulated, vec3(0.2126, 0.7152, 0.0722));
    accumulated = mix(vec3(luminance), accumulated, 1.1);
    float shadowAlpha = (1.0 - smoothstep(holeRadius * 0.38, holeRadius + 0.014, radius))
      * (0.16 + bass * 0.07);
    float alpha = clamp(
      shadowAlpha + accumulatedAlpha * 1.06 + max(max(accumulated.r, accumulated.g), accumulated.b) * 0.64,
      0.0,
      0.9
    );
    // NormalBlending expects straight alpha. The shader accumulates radiance in
    // premultiplied form, so un-premultiply once to avoid dimming it a second time.
    vec3 displayColor = accumulated / max(0.16, alpha);
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
      2,
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
    // Two RGBA texels hold all eight bands for one frame. A 32-row byte
    // texture costs only 256 bytes, avoids large fragment-uniform arrays, and
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
