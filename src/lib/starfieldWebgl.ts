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
import {
  captureScatteredAngularEnergy,
  warpAngularSectorCount,
} from "./visualizerAnalysis";

type WarpColor = readonly [number, number, number];
export type WarpPalette = readonly WarpColor[];
type WarpColorsUniform = { value: Color[]; needsUpdate?: boolean };

const bandCount = 5;
const bandEdges = [0.02, 0.09, 0.2, 0.38, 0.62, 0.9] as const;
const fallbackWarpColor: WarpColor = [99, 230, 255];
const paletteColorIndices = [0, 2, 1, 0] as const;

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
  uniform vec2 uResolution;
  uniform float uBands[5];
  uniform float uAngularEnergies[32];
  uniform float uActivity;
  uniform float uTransient;
  uniform vec3 uColors[4];

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
    float amplitude = 0.52;
    mat2 rotation = mat2(0.82, 0.57, -0.57, 0.82);
    for (int octave = 0; octave < 4; octave++) {
      value += amplitude * valueNoise(point);
      point = rotation * point * 2.04 + vec2(5.4, 8.1);
      amplitude *= 0.5;
    }
    return value;
  }

  vec3 warpColor(float progress) {
    float position = fract(progress) * 3.0;
    vec3 color;
    if (position < 1.0) color = mix(uColors[0], uColors[1], smoothstep(0.0, 1.0, position));
    else if (position < 2.0) color = mix(uColors[1], uColors[2], smoothstep(0.0, 1.0, position - 1.0));
    else color = mix(uColors[2], uColors[3], smoothstep(0.0, 1.0, position - 2.0));
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return clamp(mix(vec3(luminance), color, 1.48), 0.0, 1.0);
  }

  float bandEnergy(int layer) {
    if (layer == 0) return uBands[4];
    if (layer == 1) return uBands[2];
    if (layer == 2) return uBands[1];
    if (layer == 3) return uBands[0];
    return uBands[3];
  }

  float scatteredAngularEnergy(float progress, int layer) {
    float layerRotation = float(layer) * 0.21875;
    int sector = int(floor(fract(progress + layerRotation) * 32.0));
    return uAngularEnergies[sector];
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(1.0, uResolution.y);
    vec2 origin = vec2(0.5, 0.49);
    vec2 point = uv - origin;
    point.x *= aspect;

    float radius = length(point);
    float angle = atan(point.y, point.x);
    float normalizedAngle = (angle + PI) / TAU;
    float bass = uBands[0];
    float mids = uBands[2];
    float treble = uBands[4];
    float motionScale = mix(1.0, 0.16, uReducedMotion);
    float acceleration = (0.11 + bass * 0.36 + mids * 0.08) * motionScale;
    vec3 accumulated = vec3(0.0);
    float accumulatedAlpha = 0.0;

    for (int layer = 0; layer < 5; layer++) {
      float layerValue = float(layer);
      float rayCount = 112.0 + layerValue * 64.0;
      float angularPosition = normalizedAngle * rayCount;
      float cell = floor(angularPosition);
      float starId = cell + layerValue * 719.37;
      float distributedEnergy = scatteredAngularEnergy(normalizedAngle, layer);
      float densityEnergy = clamp(distributedEnergy * 1.26 + uActivity * 0.18 + uTransient * 0.48, 0.0, 1.0);
      float densityThreshold = mix(0.045, 0.94, pow(densityEnergy, 0.72));
      float presenceSeed = hash11(starId + 107.7);
      float presence = 1.0 - smoothstep(densityThreshold - 0.085, densityThreshold + 0.025, presenceSeed);
      if (presence == 0.0) continue;

      float angularJitter = (hash11(starId + 4.1) - 0.5) * 0.72;
      float angularDistance = abs(fract(angularPosition) - 0.5 - angularJitter);
      float cycleSpeed = acceleration * (0.72 + layerValue * 0.17 + hash11(starId + 9.7) * 0.42);
      float cycle = fract(hash11(starId + 21.3) + uTime * cycleSpeed);
      float rayWidth = mix(0.115, 0.028, cycle) * (0.74 + hash11(starId + 33.0) * 0.42 + distributedEnergy * 0.34);
      float rayHalo = 1.0 - smoothstep(rayWidth * 1.8, rayWidth * 6.2, angularDistance);
      if (rayHalo == 0.0) continue;

      float energy = max(0.025, mix(bandEnergy(layer), distributedEnergy, 0.76));
      float headRadius = 0.018 + pow(cycle, 1.78) * 1.28;
      float edgeGrowth = pow(cycle, 2.45);
      float trailLength = (0.006 + edgeGrowth * (0.075 + bass * 0.13 + distributedEnergy * 0.22 + uTransient * 0.08))
        * mix(1.0, 0.3, uReducedMotion);
      float tailRadius = max(0.012, headRadius - trailLength);
      float feather = 0.004 + edgeGrowth * 0.012;
      float radialTrail = smoothstep(tailRadius - feather, tailRadius + feather, radius)
        * (1.0 - smoothstep(headRadius, headRadius + feather * 0.68, radius));
      float head = exp(-abs(radius - headRadius) / max(0.0012, 0.0035 + edgeGrowth * 0.004));
      float rayMask = 1.0 - smoothstep(rayWidth, rayWidth * 2.7, angularDistance);
      float tailFade = smoothstep(tailRadius, headRadius, radius);
      float twinkle = 0.62 + (0.24 + treble * 0.18) * sin(uTime * (2.0 + hash11(starId) * 3.0) + starId);
      float intensity = rayMask * (radialTrail * (0.38 + tailFade * 0.72) + head * 0.88)
        * twinkle * (0.28 + energy * 1.32 + uTransient * 0.22) * mix(0.62, 1.0, edgeGrowth) * presence;

      vec3 color = warpColor(hash11(starId + 61.0) * 0.82 + layerValue * 0.13 + radius * 0.1);
      color = mix(color, vec3(0.89, 0.96, 1.0), head * 0.09);
      accumulated += color * intensity * 1.14;
      accumulated += color * rayHalo * radialTrail * (0.02 + energy * 0.13) * (0.25 + tailFade * 0.75) * presence;
      accumulated += vec3(0.88, 0.96, 1.0) * head * rayMask * (0.018 + energy * 0.075) * presence;
      accumulatedAlpha += intensity * 0.46;
    }

    vec2 dustGrid = uv * uResolution / 2.35;
    vec2 dustCell = floor(dustGrid);
    vec2 dustLocal = fract(dustGrid) - 0.5;
    float dustSeed = hash21(dustCell);
    float dustDensity = clamp(treble * 0.78 + uTransient * 0.42, 0.0, 1.0);
    float dustPoint = (1.0 - smoothstep(0.055, 0.3, length(dustLocal))) * step(mix(0.996, 0.966, dustDensity), dustSeed);
    float dustEnergy = mix(uActivity, scatteredAngularEnergy(normalizedAngle, 0), 0.72);
    float dustField = dustPoint * (1.0 - smoothstep(0.16, 0.78, radius)) * (0.035 + dustEnergy * 0.2);
    accumulated += warpColor(dustSeed * 0.72 + normalizedAngle * 0.18) * dustField;
    accumulatedAlpha += dustField * 0.38;

    float hazeNoise = fbm(point * 3.2 + vec2(uTime * 0.018, -uTime * 0.011));
    float tunnelHaze = exp(-radius * 1.85) * (0.055 + hazeNoise * 0.105) * (0.52 + mids * 0.72);
    accumulated += warpColor(normalizedAngle * 0.52 + 0.02) * tunnelHaze * 1.18;
    accumulatedAlpha += tunnelHaze * 0.34;

    float core = exp(-radius * 25.0) * (0.13 + bass * 0.35 + treble * 0.16 + uTransient * 0.28);
    float horizontalFlare = exp(-abs(point.y) * 230.0) * exp(-radius * 12.0) * (0.04 + bass * 0.09);
    float verticalFlare = exp(-abs(point.x) * 290.0) * exp(-radius * 16.0) * (0.018 + treble * 0.055);
    accumulated += mix(uColors[0], uColors[1], 0.34) * (core + horizontalFlare + verticalFlare) * 1.18;
    accumulatedAlpha += core * 0.54;

    for (int ringIndex = 0; ringIndex < 2; ringIndex++) {
      float ringPhase = fract(uTime * acceleration * 0.12 + float(ringIndex) * 0.53);
      float ringRadius = 0.11 + ringPhase * 0.92;
      float ring = exp(-abs(radius - ringRadius) * 118.0) * pow(1.0 - ringPhase, 1.8);
      float ringBreakup = 0.34 + 0.66 * fbm(vec2(normalizedAngle * 11.0 + float(ringIndex) * 3.7, uTime * 0.025));
      float ringIntensity = ring * ringBreakup * (0.045 + bass * 0.1 + uTransient * 0.16) * mix(1.0, 0.34, uReducedMotion);
      accumulated += warpColor(normalizedAngle * 0.36 + float(ringIndex) * 0.2) * ringIntensity;
      accumulatedAlpha += ringIntensity * 0.42;
    }

    float edgeVignette = 1.0 - smoothstep(0.72, 1.38, radius);
    accumulated *= 0.72 + edgeVignette * 0.28;
    accumulated = vec3(1.0) - exp(-accumulated * 2.08);
    float alpha = clamp(accumulatedAlpha * 0.78 + max(max(accumulated.r, accumulated.g), accumulated.b) * 0.5, 0.0, 0.9);
    gl_FragColor = vec4(accumulated, alpha);
  }
`;

function paletteColor(palette: WarpPalette, index: number): WarpColor {
  return palette[((index % palette.length) + palette.length) % palette.length] ?? fallbackWarpColor;
}

function averageBand(values: Uint8Array, startProgress: number, endProgress: number) {
  const start = Math.floor(values.length * startProgress);
  const end = Math.max(start + 1, Math.floor(values.length * endProgress));
  let total = 0;
  for (let index = start; index < Math.min(end, values.length); index += 1) total += values[index] ?? 0;
  return total / Math.max(1, Math.min(end, values.length) - start) / 255;
}

function captureBands(values: Uint8Array, target: Float32Array) {
  for (let band = 0; band < bandCount; band += 1) {
    target[band] = averageBand(values, bandEdges[band] ?? 0, bandEdges[band + 1] ?? 1);
  }
  return target;
}

function smoothAudioValue(current: number, target: number, attack: number, release: number) {
  return current + (target - current) * (target > current ? attack : release);
}

export class WarpStarfieldWebGLVisualizer {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: OrthographicCamera;
  private readonly geometry: PlaneGeometry;
  private readonly material: ShaderMaterial;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly outputPass: OutputPass;
  private readonly bandUniform = new Float32Array(bandCount);
  private readonly angularEnergyUniform = new Float32Array(warpAngularSectorCount);
  private readonly rawAngularEnergy = new Float32Array(warpAngularSectorCount);
  private readonly angularPeakScratch = new Float32Array(warpAngularSectorCount);
  private readonly previousAngularEnergy = new Float32Array(warpAngularSectorCount);
  private readonly paletteChannels = new Float64Array(paletteColorIndices.length * 3);
  private readonly resizeObserver: ResizeObserver;
  private activity = 0;
  private transient = 0;
  private hasAudioFrame = false;
  private hasPalette = false;
  private hasConfiguredSize = false;
  private colorsNeedUpload = true;
  private sizeNeedsUpdate = true;
  private lastObservedPixelRatio = Number.NaN;
  private appliedPixelRatio = 1;
  private readonly handleContextRestored = () => {
    this.colorsNeedUpload = true;
    this.sizeNeedsUpdate = true;
    const colorsUniform = this.material.uniforms.uColors as WarpColorsUniform | undefined;
    if (colorsUniform) colorsUniform.needsUpdate = true;
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
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
        uBands: { value: this.bandUniform },
        uAngularEnergies: { value: this.angularEnergyUniform },
        uActivity: { value: 0 },
        uTransient: { value: 0 },
        uColors: { value: [new Color(), new Color(), new Color(), new Color()] },
        uReducedMotion: { value: 0 },
        uResolution: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
      },
      vertexShader,
    });
    this.scene.add(new Mesh(this.geometry, this.material));
    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.clearAlpha = 0;
    this.bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.54, 0.76, 0.32);
    this.outputPass = new OutputPass();
    this.composer = new EffectComposer(this.renderer);
    this.composer.renderTarget1.depthBuffer = false;
    this.composer.renderTarget2.depthBuffer = false;
    this.bloomPass.renderTargetBright.depthBuffer = false;
    for (const target of this.bloomPass.renderTargetsHorizontal) target.depthBuffer = false;
    for (const target of this.bloomPass.renderTargetsVertical) target.depthBuffer = false;
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
    this.resizeObserver = new ResizeObserver(() => {
      this.sizeNeedsUpdate = true;
    });
    this.resizeObserver.observe(canvas);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
  }

  private updateSize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.2);
    if (!this.sizeNeedsUpdate && this.lastObservedPixelRatio === pixelRatio) return;
    this.sizeNeedsUpdate = false;
    this.lastObservedPixelRatio = pixelRatio;
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const targetWidth = Math.floor(width * pixelRatio);
    const targetHeight = Math.floor(height * pixelRatio);
    if (this.hasConfiguredSize && this.canvas.width === targetWidth && this.canvas.height === targetHeight) return;
    const pixelRatioChanged = this.appliedPixelRatio !== pixelRatio;
    if (pixelRatioChanged) this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    if (pixelRatioChanged) this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.appliedPixelRatio = pixelRatio;
    (this.material.uniforms.uResolution?.value as Vector2).set(targetWidth, targetHeight);
    this.hasConfiguredSize = true;
  }

  private updatePalette(palette: WarpPalette) {
    const colorsUniform = this.material.uniforms.uColors as WarpColorsUniform | undefined;
    const colors = colorsUniform?.value;
    let didChange = !this.hasPalette;

    for (let index = 0; index < paletteColorIndices.length; index += 1) {
      const color = paletteColor(palette, paletteColorIndices[index] ?? 0);
      const offset = index * 3;
      if (
        this.hasPalette
        && this.paletteChannels[offset] === color[0]
        && this.paletteChannels[offset + 1] === color[1]
        && this.paletteChannels[offset + 2] === color[2]
      ) continue;

      this.paletteChannels[offset] = color[0];
      this.paletteChannels[offset + 1] = color[1];
      this.paletteChannels[offset + 2] = color[2];
      colors?.[index]?.setRGB(color[0] / 255, color[1] / 255, color[2] / 255);
      didChange = true;
    }

    this.hasPalette = true;
    if (didChange) {
      this.colorsNeedUpload = true;
      if (colorsUniform) colorsUniform.needsUpdate = true;
    }
  }

  render(values: Uint8Array, time: number, palette: WarpPalette, reducedMotion: boolean, isActive = true) {
    this.updateSize();
    captureBands(values, this.bandUniform);
    if (!isActive) {
      this.angularEnergyUniform.fill(0);
      this.rawAngularEnergy.fill(0);
      this.previousAngularEnergy.fill(0);
      this.activity = 0;
      this.transient = 0;
      this.hasAudioFrame = false;
    } else {
      captureScatteredAngularEnergy(values, this.rawAngularEnergy, this.angularPeakScratch);
      let energySquares = 0;
      let positiveDelta = 0;
      for (let sector = 0; sector < warpAngularSectorCount; sector += 1) {
        const rawEnergy = this.rawAngularEnergy[sector] ?? 0;
        const previousEnergy = this.previousAngularEnergy[sector] ?? 0;
        if (this.hasAudioFrame) positiveDelta += Math.max(0, rawEnergy - previousEnergy);
        this.previousAngularEnergy[sector] = rawEnergy;
        this.angularEnergyUniform[sector] = smoothAudioValue(this.angularEnergyUniform[sector] ?? 0, rawEnergy, 0.42, 0.13);
        energySquares += rawEnergy * rawEnergy;
      }
      this.hasAudioFrame = true;
      const targetActivity = Math.min(1, Math.sqrt(energySquares / warpAngularSectorCount) * 1.28);
      const targetTransient = Math.min(1, (positiveDelta / warpAngularSectorCount) * 7.5);
      this.activity = smoothAudioValue(this.activity, targetActivity, 0.3, 0.09);
      this.transient = smoothAudioValue(this.transient, targetTransient, 0.58, 0.085);
    }
    this.updatePalette(palette);
    this.material.uniforms.uTime!.value = time * 0.001;
    this.material.uniforms.uReducedMotion!.value = reducedMotion ? 1 : 0;
    this.material.uniforms.uActivity!.value = this.activity;
    this.material.uniforms.uTransient!.value = reducedMotion ? this.transient * 0.28 : this.transient;
    this.bloomPass.strength = reducedMotion ? 0.2 : 0.38 + this.activity * 0.24 + this.transient * 0.26;
    this.composer.render();
    if (this.colorsNeedUpload) {
      this.colorsNeedUpload = false;
      const colorsUniform = this.material.uniforms.uColors as WarpColorsUniform | undefined;
      if (colorsUniform) colorsUniform.needsUpdate = false;
    }
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.geometry.dispose();
    this.material.dispose();
    this.bloomPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
