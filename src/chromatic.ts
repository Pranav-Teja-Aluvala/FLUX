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
const historyRows = 64;
const rowInterval = 1 / 30;

const vertex = `
  uniform sampler2D history;
  uniform float head, mirror;
  varying vec2 field;
  varying vec3 world;
  varying vec3 surfaceNormal;
  varying float energy;
  float amplitude(vec2 at) {
    float band = (clamp(at.x, 0., 1.) * ${spectrumCount - 1}.0 + .5) / ${spectrumCount}.0;
    return texture2D(history, vec2(band, head - clamp(at.y, 0., 1.) * ${historyRows - 1}.0 / ${historyRows}.0)).r;
  }
  float elevation(vec2 at, float level) {
    float edges = smoothstep(0., .045, at.x) * (1. - smoothstep(.955, 1., at.x));
    return mix(pow(level, 1.4) * 1.62 * edges, -.045 - pow(level, 1.4) * .39 * edges, mirror);
  }
  float height(vec2 at) {
    return elevation(at, amplitude(at));
  }
  void main() {
    field = uv;
    energy = amplitude(uv);
    vec2 dx = vec2(.013, 0.);
    vec2 dy = vec2(0., .009);
    float widthSlope = (height(uv + dx) - height(uv - dx)) / .1443;
    float depthSlope = (height(uv + dy) - height(uv - dy)) / .0765;
    surfaceNormal = normalize(vec3(-widthSlope, 1., depthSlope));
    float width = mix(5.75, 5.18, uv.y);
    float curvature = pow(abs(uv.x * 2. - 1.), 2.) * .32;
    vec3 p = vec3((uv.x - .5) * width, elevation(uv, energy), 1.4 - uv.y * 4.25 - curvature);
    world = (modelMatrix * vec4(p, 1.)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.);
  }
`;

const fragment = `
  uniform float mirror;
  varying vec2 field;
  varying vec3 world;
  varying vec3 surfaceNormal;
  varying float energy;
  void main() {
    vec3 normal = normalize(surfaceNormal);
    vec3 view = normalize(cameraPosition - world);
    vec3 key = normalize(vec3(-.46, .85, .32));
    vec3 rim = normalize(vec3(.68, .35, -.78));
    float diffusion = max(dot(normal, key), 0.);
    float facing = max(dot(normal, view), 0.);
    float fresnel = pow(1. - facing, 3.);
    float soft = pow(max(dot(normal, normalize(key + view)), 0.), 13.);
    float edge = pow(max(dot(normal, normalize(rim + view)), 0.), 32.);
    vec3 ray = reflect(-view, normal);
    float stripOffset = (ray.y - .32) * 12.;
    float strip = exp(-stripOffset * stripOffset) *
      smoothstep(-.8, -.05, ray.x) * (1. - smoothstep(.58, 1., ray.x));

    vec3 copper = vec3(.73, .25, .072);
    vec3 steel = vec3(.055, .30, .67);
    vec3 indigo = vec3(.27, .15, .63);
    vec3 tint = mix(copper, steel, smoothstep(.08, .53, field.x));
    tint = mix(tint, indigo, smoothstep(.55, 1., field.x));
    float strength = smoothstep(.015, .86, energy);
    float trace = 1. - smoothstep(.04, .22, abs(fract(field.y * 31. + .5) - .5));
    float grain = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
    vec3 paper = vec3(.00152, .00182, .00182);
    vec3 light = tint * strength * (.39 + diffusion * .83 + fresnel * .70);
    light += mix(tint, vec3(.79, .92, 1.), .58) * strength * (soft * .62 + edge * .60 + strip * .58);
    light += tint * (trace * strength * .28 + grain * .017 * strength);
    float leadingEdge = (1. - smoothstep(.004, .016, field.y)) * strength;
    light += mix(tint, vec3(.75, .91, 1.), .62) * leadingEdge * .34;
    float fading = (1. - smoothstep(.55, 1., field.y)) *
      smoothstep(0., .072, field.x) * (1. - smoothstep(.928, 1., field.x));
    if (mirror > .5) {
      gl_FragColor = vec4(light * .46, strength * fading * .34 * (1. - smoothstep(0., .46, field.y)));
    } else {
      gl_FragColor = vec4(paper + light * fading + tint * fading * trace * .013, 1.);
    }
    #include <colorspace_fragment>
  }
`;

const backdropFragment = `
  uniform float signal;
  uniform float viewportAspect;
  varying vec2 uv0;
  void main() {
    vec2 axis = (uv0 - vec2(.5, .43)) * vec2(viewportAspect, 1.);
    float floorLight = exp(-dot(axis * vec2(2., 5.), axis * vec2(2., 5.)));
    float amber = exp(-dot((axis + vec2(.24, .07)) * 3., (axis + vec2(.24, .07)) * 3.));
    float grain = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
    vec3 color = vec3(.00152, .00182, .00182);
    color += floorLight * vec3(.004, .009, .021) * signal;
    color += amber * vec3(.008, .003, .001) * signal;
    gl_FragColor = vec4(color + grain * .00045, 1.);
    #include <colorspace_fragment>
  }
`;

export function createSpectrum() {
  const cells = new Uint8Array(spectrumCount * historyRows);
  const levels = new Float32Array(spectrumCount);
  const texture = new THREE.DataTexture(cells, spectrumCount, historyRows, THREE.RedFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.wrapT = THREE.RepeatWrapping;
  const head = { value: .5 / historyRows };
  const geometry = new THREE.PlaneGeometry(1, 1, 110, 92);
  const material = new THREE.ShaderMaterial({
    uniforms: { history: { value: texture }, head, mirror: { value: 0 } },
    vertexShader: vertex, fragmentShader: fragment, side: THREE.DoubleSide,
  });
  const reflection = new THREE.ShaderMaterial({
    uniforms: { history: { value: texture }, head, mirror: { value: 1 } },
    vertexShader: vertex, fragmentShader: fragment, side: THREE.DoubleSide,
    transparent: true, depthWrite: false,
  });
  const surface = new THREE.Mesh(geometry, material);
  const mirror = new THREE.Mesh(geometry, reflection);
  surface.frustumCulled = mirror.frustumCulled = false;
  const group = new THREE.Group();
  const backgroundGeometry = new THREE.PlaneGeometry(2, 2);
  const backgroundMaterial = new THREE.ShaderMaterial({
    uniforms: { signal: { value: 0 }, viewportAspect: { value: 1 } },
    vertexShader: "varying vec2 uv0; void main(){uv0=uv;gl_Position=vec4(position,1.);}",
    fragmentShader: backdropFragment,
    depthTest: false,
    depthWrite: false,
  });
  const background = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
  background.frustumCulled = false;
  background.renderOrder = -1;
  group.add(background, surface, mirror);
  group.visible = false;
  let row = 0;
  let elapsed = 0;

  function reset() {
    cells.fill(0);
    levels.fill(0);
    backgroundMaterial.uniforms.signal.value = 0;
    texture.needsUpdate = true;
    elapsed = rowInterval;
    row = 0;
    head.value = .5 / historyRows;
  }
  function sample(bins: Uint8Array, hz: number, dt: number, bass: number, mid: number, treble: number) {
    elapsed += dt;
    if (elapsed < rowInterval) return;
    const period = Math.min(elapsed, 0.12);
    elapsed %= rowInterval;
    row = (row + 1) % historyRows;
    const offset = row * spectrumCount;
    for (let index = 0; index < spectrumCount; index++) {
      const gain = index < 9 ? bass : index < 24 ? mid : treble;
      const raw = spectrumValue(bins, hz, index);
      const value = Math.min(1, Math.max(0, (raw - .17) / .83) * gain);
      const previous = levels[index];
      levels[index] += (value - previous) * (1 - Math.exp(-period * (value > previous ? 44 : 19)));
      cells[offset + index] = Math.round(levels[index] * 255);
    }
    head.value = (row + .5) / historyRows;
    texture.needsUpdate = true;
  }
  reset();
  return {
    group, reset, sample,
    light(energy: number, aspect: number) {
      backgroundMaterial.uniforms.signal.value = Math.min(1, energy * 10);
      backgroundMaterial.uniforms.viewportAspect.value = aspect;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      reflection.dispose();
      backgroundGeometry.dispose();
      backgroundMaterial.dispose();
      texture.dispose();
    },
  };
}
