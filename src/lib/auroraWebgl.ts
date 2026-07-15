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
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

type AuroraColor = readonly [number, number, number];
export type AuroraPalette = readonly AuroraColor[];

const bandCount = 5;
const historyFrameCount = 5;
const captureIntervalMs = 90;
const shaderColorCount = 8;

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
  uniform float uTime;
  uniform float uReducedMotion;
  uniform float uRainbow;
  uniform vec2 uResolution;
  uniform float uHistory[25];
  uniform vec3 uColors[8];

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
    float amplitude = 0.52;
    mat2 rotation = mat2(0.82, 0.57, -0.57, 0.82);
    for (int octave = 0; octave < 5; octave++) {
      value += amplitude * valueNoise(point);
      point = rotation * point * 2.03 + vec2(7.1, 3.7);
      amplitude *= 0.5;
    }
    return value;
  }

  float sampleBands(float x, float b0, float b1, float b2, float b3, float b4) {
    float position = clamp(x, 0.0, 0.9999) * 4.0;
    if (position < 1.0) return mix(b0, b1, position);
    if (position < 2.0) return mix(b1, b2, position - 1.0);
    if (position < 3.0) return mix(b2, b3, position - 2.0);
    return mix(b3, b4, position - 3.0);
  }

  float historyEnergy(int layer, float x) {
    if (layer == 0) return sampleBands(x, uHistory[0], uHistory[1], uHistory[2], uHistory[3], uHistory[4]);
    if (layer == 1) return sampleBands(x, uHistory[5], uHistory[6], uHistory[7], uHistory[8], uHistory[9]);
    if (layer == 2) return sampleBands(x, uHistory[10], uHistory[11], uHistory[12], uHistory[13], uHistory[14]);
    if (layer == 3) return sampleBands(x, uHistory[15], uHistory[16], uHistory[17], uHistory[18], uHistory[19]);
    return sampleBands(x, uHistory[20], uHistory[21], uHistory[22], uHistory[23], uHistory[24]);
  }

  vec3 auroraColor(float progress) {
    float normalizedProgress = clamp(progress, 0.0, 0.9999);
    float position = normalizedProgress * 7.0;
    if (uRainbow > 0.5) {
      if (normalizedProgress < 0.32) {
        position = normalizedProgress / 0.32 * 2.0;
      } else if (normalizedProgress < 0.55) {
        position = 2.0 + (normalizedProgress - 0.32) / 0.23 * 2.0;
      } else if (normalizedProgress < 0.75) {
        position = 4.0 + (normalizedProgress - 0.55) / 0.2 * 1.5;
      } else {
        position = 5.5 + (normalizedProgress - 0.75) / 0.25 * 1.5;
      }
    }
    if (position < 1.0) return mix(uColors[0], uColors[1], smoothstep(0.0, 1.0, position));
    if (position < 2.0) return mix(uColors[1], uColors[2], smoothstep(0.0, 1.0, position - 1.0));
    if (position < 3.0) return mix(uColors[2], uColors[3], smoothstep(0.0, 1.0, position - 2.0));
    if (position < 4.0) return mix(uColors[3], uColors[4], smoothstep(0.0, 1.0, position - 3.0));
    if (position < 5.0) return mix(uColors[4], uColors[5], smoothstep(0.0, 1.0, position - 4.0));
    if (position < 6.0) return mix(uColors[5], uColors[6], smoothstep(0.0, 1.0, position - 5.0));
    return mix(uColors[6], uColors[7], smoothstep(0.0, 1.0, position - 6.0));
  }

  void main() {
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    float aspect = uResolution.x / max(1.0, uResolution.y);
    float motion = uTime * mix(0.16, 0.035, uReducedMotion);
    vec3 accumulated = vec3(0.0);
    float accumulatedAlpha = 0.0;

    for (int layer = 0; layer < 5; layer++) {
      float depth = float(layer) / 4.0;
      float layerPhase = float(layer) * 1.713;
      float energy = max(0.07, historyEnergy(layer, uv.x));
      float reactiveEnergy = smoothstep(0.045, 0.55, energy);
      float broadNoise = fbm(vec2(uv.x * 3.4 + layerPhase, motion * 0.35 + layerPhase));
      float ridge = 0.17
        + (1.0 - depth) * 0.038
        + sin(uv.x * 4.7 + motion * 0.7 + layerPhase - 0.5) * 0.086
        + sin(uv.x * 11.8 - motion * 0.42 + layerPhase) * 0.024
        + (broadNoise - 0.5) * 0.064
        - uRainbow * reactiveEnergy * 0.042;
      float below = uv.y - ridge;
      float foldNoise = fbm(vec2(uv.x * 10.0 + layerPhase, below * 3.2 - motion * 0.48));
      float bottomNoise = fbm(vec2(uv.x * 18.0 - motion * 0.16, layerPhase + 4.7));
      float originalLength = 0.36 + energy * 0.32 + (bottomNoise - 0.5) * 0.2 + sin(uv.x * 9.0 + layerPhase) * 0.052;
      float rainbowLength = 0.27 + reactiveEnergy * 0.53 + (bottomNoise - 0.5) * 0.25 + sin(uv.x * 9.0 + layerPhase) * 0.065;
      float length = mix(originalLength, rainbowLength, uRainbow);
      float topMask = smoothstep(-0.026, 0.018, below);
      float bottomMask = 1.0 - smoothstep(
        length * mix(0.48, 0.46, uRainbow),
        length,
        below + (foldNoise - 0.5) * mix(0.085, 0.11, uRainbow)
      );
      float body = topMask * bottomMask;

      float xWarp = uv.x
        + (foldNoise - 0.5) * (0.017 + energy * 0.012)
        + sin(below * 8.0 + layerPhase) * 0.004;
      float finePhase = xWarp * mix(640.0, 410.0, uReducedMotion)
        + fbm(vec2(uv.x * 28.0, motion * 0.42 + layerPhase)) * 15.0
        + below * 7.0;
      float filamentWave = 0.5 + 0.5 * sin(finePhase);
      float originalFineFilaments = pow(filamentWave, 7.0);
      float rainbowFineFilaments = pow(filamentWave, 11.0);
      float fineFilaments = mix(originalFineFilaments, rainbowFineFilaments, uRainbow);
      float hairFilaments = pow(0.5 + 0.5 * sin(finePhase * 1.91 + layerPhase * 2.7), 18.0);
      float mediumFoldWave = 0.5 + 0.5 * sin(xWarp * 104.0 - motion + layerPhase);
      float mediumFolds = mix(pow(mediumFoldWave, 3.2), pow(mediumFoldWave, 4.8), uRainbow);
      float originalEnvelope = 0.22 + 0.78 * fbm(vec2(uv.x * 6.8 + layerPhase, below * 1.7 - motion * 0.14));
      float rainbowEnvelope = 0.16 + 0.84 * fbm(vec2(uv.x * 7.4 + layerPhase, below * 1.9 - motion * 0.14));
      float filamentEnvelope = mix(originalEnvelope, rainbowEnvelope, uRainbow);
      float strandCell = floor(xWarp * mix(260.0, 170.0, uReducedMotion));
      float strandReach = 0.4 + hash21(vec2(strandCell, layerPhase * 19.0)) * 0.78;
      float strandBottomMask = 1.0 - smoothstep(
        length * strandReach * 0.58,
        length * strandReach,
        below + (foldNoise - 0.5) * 0.14
      );
      float filamentBody = mix(body, topMask * strandBottomMask, uRainbow);
      float originalSilk = 0.12 + fineFilaments * 0.74 * filamentEnvelope + mediumFolds * 0.25;
      float rainbowSilk = fineFilaments * 1.22 * filamentEnvelope + hairFilaments * 0.88 + mediumFolds * 0.14;
      float silk = mix(originalSilk, rainbowSilk, uRainbow);

      float ridgeCore = exp(-abs(below) * 170.0);
      float ridgeHalo = exp(-abs(below) * 19.0);
      float curtainHalo = exp(-max(0.0, below) * 4.6)
        * (1.0 - smoothstep(length * 0.68, length + 0.19, below))
        * smoothstep(-0.075, 0.015, below);
      float originalWisps = body * silk * (0.28 + energy * 0.78);
      float rainbowWisps = filamentBody * silk * (0.26 + reactiveEnergy * 1.62)
        + body * mediumFolds * (0.018 + reactiveEnergy * 0.12);
      float wisps = mix(originalWisps, rainbowWisps, uRainbow);
      float originalDiffuse = body * (0.27 + energy * 0.38) * (0.66 + foldNoise * 0.38);
      float rainbowDiffuse = body * (0.018 + reactiveEnergy * 0.065) * (0.55 + foldNoise * 0.45);
      float diffuseCurtain = mix(originalDiffuse, rainbowDiffuse, uRainbow);
      float layerFade = mix(mix(0.07, 0.45, depth), mix(0.045, 0.42, depth), uRainbow);
      float ridgeAge = 0.1 + 0.62 * pow(depth, 4.0);
      float ridgeStrength = mix(0.76 + energy * 0.58, 0.64 + reactiveEnergy * 0.68, uRainbow);
      float intensity = (wisps + diffuseCurtain + ridgeCore * ridgeStrength * ridgeAge) * layerFade;
      intensity += curtainHalo
        * mix(0.038 + energy * 0.058, 0.014 + reactiveEnergy * 0.034, uRainbow)
        * mix(0.35, 1.0, depth);
      intensity += ridgeHalo * mix(0.022 + energy * 0.032, 0.014 + reactiveEnergy * 0.028, uRainbow) * ridgeAge;
      intensity *= 0.82 + 0.18 * sin(uv.x * aspect * 8.0 + layerPhase);

      float curtainProgress = clamp(max(0.0, below) / max(0.001, length), 0.0, 1.0);
      float palettePosition = uv.x + (foldNoise - 0.5) * 0.055 + depth * 0.018;
      vec3 ridgeColor = auroraColor(palettePosition - 0.025);
      vec3 tailColor = auroraColor(palettePosition + 0.11 + broadNoise * 0.035);
      vec3 color = mix(ridgeColor, tailColor, smoothstep(0.08, 0.94, curtainProgress) * 0.62);
      float prismaticFold = mediumFolds * (0.035 + energy * 0.075) * (0.25 + curtainProgress * 0.75);
      color = mix(color, auroraColor(palettePosition + 0.2), prismaticFold);
      float whiteCore = mix(
        ridgeCore * 0.07 + fineFilaments * energy * 0.014,
        ridgeCore * 0.045 + hairFilaments * reactiveEnergy * 0.009,
        uRainbow
      );
      color = mix(color, vec3(0.88, 0.98, 1.0), whiteCore);
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luminance), color, mix(1.08, 1.18, uRainbow));
      float tailBrightness = mix(
        mix(1.08, 0.68, smoothstep(0.22, 1.0, curtainProgress)),
        mix(1.04, 0.58, smoothstep(0.18, 1.0, curtainProgress)),
        uRainbow
      );
      color *= tailBrightness;
      float palettePresence = mix(1.28, 1.26, uRainbow);
      accumulated += color * intensity * palettePresence;
      accumulatedAlpha += intensity * mix(0.68, 0.7, uRainbow);
    }

    float atmosphericGlow = fbm(vec2(uv.x * 2.2, uv.y * 1.6 - motion * 0.12));
    accumulated += auroraColor(uv.x) * atmosphericGlow * mix(0.035, 0.022, uRainbow) * (1.0 - smoothstep(0.1, 0.76, uv.y));
    accumulated = vec3(1.0) - exp(-accumulated * mix(1.62, 1.65, uRainbow));
    float alpha = clamp(
      accumulatedAlpha * mix(0.88, 0.9, uRainbow)
        + max(max(accumulated.r, accumulated.g), accumulated.b) * mix(0.5, 0.48, uRainbow),
      0.0,
      mix(0.86, 0.84, uRainbow)
    );
    gl_FragColor = vec4(accumulated, alpha);
  }
`;

function paletteColor(palette: AuroraPalette, index: number): AuroraColor {
  return palette[((index % palette.length) + palette.length) % palette.length] ?? [99, 230, 255];
}

function averageBand(values: Uint8Array, startProgress: number, endProgress: number) {
  const start = Math.floor(values.length * startProgress);
  const end = Math.max(start + 1, Math.floor(values.length * endProgress));
  let total = 0;
  for (let index = start; index < Math.min(end, values.length); index += 1) total += values[index] ?? 0;
  return total / Math.max(1, Math.min(end, values.length) - start) / 255;
}

function captureFrame(values: Uint8Array) {
  const edges = [0.02, 0.09, 0.2, 0.38, 0.62, 0.9];
  return Float32Array.from({ length: bandCount }, (_, band) => averageBand(values, edges[band] ?? 0, edges[band + 1] ?? 1));
}

export class AuroraWebGLVisualizer {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: OrthographicCamera;
  private readonly geometry: PlaneGeometry;
  private readonly material: ShaderMaterial;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly outputPass: OutputPass;
  private readonly historyUniform = new Float32Array(historyFrameCount * bandCount);
  private frames: Float32Array[] = [];
  private lastCapturedAt = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      alpha: true,
      antialias: false,
      canvas,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.geometry = new PlaneGeometry(2, 2);
    this.material = new ShaderMaterial({
      blending: NormalBlending,
      depthTest: false,
      depthWrite: false,
      fragmentShader,
      transparent: true,
      uniforms: {
        uColors: { value: Array.from({ length: shaderColorCount }, () => new Color()) },
        uHistory: { value: this.historyUniform },
        uRainbow: { value: 0 },
        uReducedMotion: { value: 0 },
        uResolution: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
      },
      vertexShader,
    });
    this.scene.add(new Mesh(this.geometry, this.material));
    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.clearAlpha = 0;
    this.bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.28, 0.62, 0.34);
    this.outputPass = new OutputPass();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
  }

  private updateSize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.2);
    const targetWidth = Math.floor(width * pixelRatio);
    const targetHeight = Math.floor(height * pixelRatio);
    if (this.canvas.width === targetWidth && this.canvas.height === targetHeight) return;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    (this.material.uniforms.uResolution?.value as Vector2).set(targetWidth, targetHeight);
  }

  private updateHistory(values: Uint8Array, time: number, shouldCapture: boolean, reducedMotion: boolean, isRainbow: boolean) {
    if (!shouldCapture && this.frames.length > 0) return;
    const baseInterval = isRainbow ? 48 : captureIntervalMs;
    const interval = reducedMotion ? baseInterval * 2 : baseInterval;
    if (this.frames.length > 0 && time - this.lastCapturedAt < interval) return;
    const frame = captureFrame(values);
    if (this.frames.length === 0) this.frames = Array.from({ length: historyFrameCount }, () => frame.slice());
    else {
      this.frames.push(frame);
      if (this.frames.length > historyFrameCount) this.frames.shift();
    }
    this.frames.forEach((historyFrame, frameIndex) => this.historyUniform.set(historyFrame, frameIndex * bandCount));
    this.lastCapturedAt = time;
  }

  private updatePalette(palette: AuroraPalette) {
    const colors = this.material.uniforms.uColors?.value as Color[];
    colors.forEach((target, index) => {
      const palettePosition = (index / (shaderColorCount - 1)) * Math.max(0, palette.length - 1);
      const firstIndex = Math.floor(palettePosition);
      const secondIndex = Math.min(palette.length - 1, firstIndex + 1);
      const amount = palettePosition - firstIndex;
      const first = paletteColor(palette, firstIndex);
      const second = paletteColor(palette, secondIndex);
      const color: AuroraColor = [
        first[0] + (second[0] - first[0]) * amount,
        first[1] + (second[1] - first[1]) * amount,
        first[2] + (second[2] - first[2]) * amount,
      ];
      target.setRGB(color[0] / 255, color[1] / 255, color[2] / 255);
    });
  }

  render(values: Uint8Array, time: number, palette: AuroraPalette, reducedMotion: boolean, shouldCapture: boolean, isRainbow: boolean) {
    this.updateSize();
    this.updateHistory(values, time, shouldCapture, reducedMotion, isRainbow);
    this.updatePalette(palette);
    this.material.uniforms.uTime!.value = time * 0.001;
    this.material.uniforms.uReducedMotion!.value = reducedMotion ? 1 : 0;
    this.material.uniforms.uRainbow!.value = isRainbow ? 1 : 0;
    this.bloomPass.strength = reducedMotion ? (isRainbow ? 0.15 : 0.13) : (isRainbow ? 0.31 : 0.28);
    this.composer.render();
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.bloomPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
