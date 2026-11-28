import * as THREE from "three";

export const spectrumCount = 36;
export const spectrumMin = 48;
export const spectrumMax = 12000;
export function spectrumValue(
  data: Uint8Array,
  hzPerBin: number,
  index: number,
) {
  const ratio = spectrumMax / spectrumMin;
  const low = spectrumMin * Math.pow(ratio, index / spectrumCount);
  const high = spectrumMin * Math.pow(ratio, (index + 1) / spectrumCount);
  const first = Math.max(1, Math.ceil(low / hzPerBin));
  const last = Math.min(data.length, Math.ceil(high / hzPerBin));
  if (last <= first)
    return (
      (data[
        Math.min(data.length - 1, Math.round(Math.sqrt(low * high) / hzPerBin))
      ] ?? 0) / 255
    );
  let value = 0;
  for (let i = first; i < last; i++) value = Math.max(value, data[i]);
  return value / 255;
}
const historyRows = 80;
const rowInterval = 1 / 30;

const vertex = `
  varying vec2 point;
  void main() {
    point = uv * 2. - 1.;
    gl_Position = vec4(position, 1.);
  }
`;

const fragment = `
  uniform sampler2D history;
  uniform float head, aspect, rotation, pulse;
  uniform vec3 bassTint, midTint, trebleTint;
  varying vec2 point;

  vec3 frequencyColor(float f) {
    vec3 color = mix(bassTint, midTint, smoothstep(.05, .55, f));
    return mix(color, trebleTint, smoothstep(.44, .94, f));
  }

  float field(float frequency, float age) {
    float band = (clamp(frequency, 0., 1.) * ${spectrumCount - 1}. + .5) / ${spectrumCount}.;
    return texture2D(history, vec2(band, head - age * ${historyRows - 1}. / ${historyRows}. )).r;
  }

  void main() {
    vec2 centered = point * (aspect > 1. ? vec2(aspect, 1.) : vec2(1., 1. / aspect));
    float turn = clamp(rotation, -.55, .55);
    float sn = sin(turn);
    float cs = cos(turn);
    vec2 lens = mat2(cs, -sn, sn, cs) * centered;
    lens.y /= .84 + abs(turn) * .08;
    const float tau = 6.2831853;
    float polar = fract(atan(lens.y, lens.x) / tau + .75);
    // Mirror the band ordering so bass meets at the top and treble at the bottom.
    float instantFrequency = 1. - abs(polar * 2. - 1.);
    float fresh = field(instantFrequency, 0.);
    float radius = length(lens) - pow(fresh, 1.3) * .077 - pulse * .035;
    float age = clamp((radius - .34) / .47, 0., 1.);
    float frequency = 1. - abs(fract(polar + age * .1) * 2. - 1.);
    float signal = field(frequency, age);
    float inside = smoothstep(.325, .365, radius);
    float outside = 1. - smoothstep(.65, .85, radius);
    float intensity = pow(signal, 1.48) * inside * outside;
    float edge = exp(-abs(radius - .344) * 126.);
    float fringe = exp(-abs(radius - .338) * 34.);
    float bandLight = 1. - smoothstep(.04, .20, abs(fract(age * 29.) - .5));
    float sector = abs(fract(frequency * 48.) - .5);
    float textureLight = .76 + .24 * smoothstep(.02, .24, sector);
    float streak = smoothstep(.09, .54, signal) * bandLight;

    vec3 ink = frequencyColor(frequency);
    vec3 highlight = mix(ink, vec3(1.), .56);
    vec3 color = vec3(.0018);
    color += mix(bassTint, midTint, .42) * .032 * exp(-radius * radius * 4.5);
    color += ink * intensity * (.89 + streak * .47) * textureLight;
    color += highlight * pow(signal, 3.5) * inside * outside * .7;
    color += ink * fringe * pow(fresh, 1.5) * .19;
    color += highlight * edge * (.035 + fresh * .92);
    float outerRim = exp(-abs(radius - .816) * 175.);
    color += mix(ink, highlight, .25) * .12 * outerRim * (.30 + intensity);
    float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
    color += (grain - .38) * .0012;
    gl_FragColor = vec4(max(vec3(0.), color), 1.);
    #include <colorspace_fragment>
  }
`;

export function createSpectrum() {
  const cells = new Uint8Array(spectrumCount * historyRows);
  const levels = new Float32Array(spectrumCount);
  const texture = new THREE.DataTexture(cells, spectrumCount, historyRows, THREE.RedFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapT = THREE.RepeatWrapping;
  const uniforms = {
    history: { value: texture },
    head: { value: .5 / historyRows },
    aspect: { value: 1 },
    rotation: { value: 0 },
    pulse: { value: 0 },
    bassTint: { value: new THREE.Color() },
    midTint: { value: new THREE.Color() },
    trebleTint: { value: new THREE.Color() },
  };
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment });
  const aperture = new THREE.Mesh(geometry, material);
  aperture.frustumCulled = false;
  aperture.visible = false;

  let row = 0;
  let elapsed = rowInterval;
  function reset() {
    cells.fill(0);
    levels.fill(0);
    texture.needsUpdate = true;
    elapsed = rowInterval;
    row = 0;
    uniforms.head.value = .5 / historyRows;
  }
  function sample(bins: Uint8Array, hz: number, dt: number, bass: number, mid: number, treble: number) {
    elapsed += dt;
    if (elapsed < rowInterval) return;
    const period = elapsed;
    elapsed %= rowInterval;
    row = (row + 1) % historyRows;
    const offset = row * spectrumCount;
    for (let index = 0; index < spectrumCount; index++) {
      const gain = index < 9 ? bass : index < 24 ? mid : treble;
      const raw = spectrumValue(bins, hz, index);
      const level = Math.max(0, (raw - .07) / .93);
      const value = Math.min(1, Math.pow(level, .82) * gain);
      const prior = levels[index];
      const response = 1 - Math.exp(-period * (value > prior ? 48 : 19));
      levels[index] += (value - prior) * response;
      cells[offset + index] = Math.round(levels[index] * 255);
    }
    uniforms.head.value = (row + .5) / historyRows;
    texture.needsUpdate = true;
  }
  reset();
  return {
    aperture,
    reset,
    sample,
    view(aspect: number, rotation: number, pulse: number) {
      uniforms.aspect.value = aspect;
      uniforms.rotation.value = rotation;
      uniforms.pulse.value = pulse;
    },
    setPalette(bass: THREE.Color, mid: THREE.Color, treble: THREE.Color) {
      uniforms.bassTint.value.copy(bass);
      uniforms.midTint.value.copy(mid);
      uniforms.trebleTint.value.copy(treble);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
