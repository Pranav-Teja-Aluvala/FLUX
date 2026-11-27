import { createSpectrum } from "./chromatic";
import type { CoverPalette } from "./desktop";
import * as T from "three";
import type { AudioEngine } from "./audio";
import type { Settings } from "./settings";
const palettes = [
  ["#426eff", "#f07939", "#b080ff"],
  ["#0a77ff", "#54f4db", "#a6ffec"],
  ["#e83266", "#ffc258", "#602a90"],
  ["#748a9a", "#f7f4de", "#b7cae5"],
];
const scenePalettes = [
  palettes[0],
  ["#284ba5", "#ff8dbf", "#89ecff"],
  ["#18b9ad", "#ff914d", "#a6fff2"],
  ["#31459a", "#ff839d", "#64ecd6"],
  ["#4888ac", "#edf0de", "#acd7ed"],
  ["#144de7", "#fa6223", "#ffe38d"],
];
const sceneColors = scenePalettes.map((p) => p.map((c) => new T.Color(c)));
const colors = palettes.map((p) => p.map((c) => new T.Color(c)));
const hash = (x: number) => {
  const n = Math.sin(x * 127.1 + 19.7) * 43758.5453;
  return n - Math.floor(n);
};
const vertex = `
uniform float t,bass,mid,high,beat,scale,dist,complexity;
uniform int kind;
varying float tone, depth;
attribute float seed;
void main(){
 vec3 p=position;
 if(kind==0){
 float fold=sin(p.x*(3.+complexity*3.)+t)*cos(p.y*6.-t*.7)*sin(p.z*5.+t*.41);
 p *= 1.+bass*.23+fold*(.09+mid*.23)*dist;
 p += normalize(p)*pow(seed,20.)*(.1+high*2.4);
 tone=clamp(.5+(position.x*.56+position.y*.31+position.z*.18)+fold*.24+sin(position.z*5.-t*.65)*.11,0.,1.);
 }else if(kind==1){
 float z=p.z+t*1.35;
 float ridges=pow(.5+.5*sin(p.x*.67+sin(z*.45)*1.3+sin(z*.17)*2.),2.8);
 p.y=(ridges*(1.6+bass*1.65)+sin(z*.55+p.x*.28)*.53)*dist-1.05;
 p.y+=sin(z*2.3+p.x*2.)*mid*.44*complexity;
 tone=clamp(.35+p.y*.33,0.,1.);
 }else{
 p *= 1.+bass*.3;
 p.x+=sin(p.z*1.8+t+seed)*mid*.9*dist;
 p.y+=cos(p.x+t*.8+seed)*bass*.6*dist;
 tone=seed;
 }
 vec4 mv=modelViewMatrix*vec4(p,1.);
 depth=-mv.z;
 gl_PointSize=clamp(scale*(1.1+seed*.8+high*.9)/max(.25,depth*.29),.7,9.);
 if(kind==4)gl_PointSize *= 1.2+pow(seed,9.)*3.;
 gl_Position=projectionMatrix*mv;
}`;
const fragment = `
varying float tone,depth;
uniform vec3 a,b,c;
uniform float bloom,high;
uniform int kind;
void main(){
 float d=length(gl_PointCoord-.5)*2.;
 if(d>1.)discard;
 vec3 col=mix(mix(a,c,min(tone*2.,1.)),b,max(tone*2.-1.,0.));
 if(kind==0)col=mix(mix(a,b,smoothstep(.18,.82,tone)),c,pow(1.-abs(tone*2.-1.),5.)*.15);
 float alpha=exp(-d*d*(3.2-bloom))*(1.-smoothstep(.60,1.,d))/(1.+max(0.,depth-4.)*.09);
 if(kind==1)alpha=min(1.,alpha*(4.+tone*2.)*(.27+.73*exp(-max(0.,depth-4.)*.045)));
 if(kind==1)col=mix(col,b,pow(tone,3.)*.65);
 if(kind==4)col=mix(col,vec3(.95),pow(1.-d,5.));
 gl_FragColor=vec4(col*(1.1+bloom+high*.5),alpha);
 #include <colorspace_fragment>
}`;
const liquid = `
uniform float t,bass,mid,high,dist,complexity,bloom;
uniform vec3 a,b,c;
uniform vec2 resolution;
varying vec2 uv0;
void main(){
 vec2 p=(uv0-.5)*vec2(resolution.x/resolution.y,1.)*2.;
 float framing=min(1.,resolution.x/resolution.y)*.87+.14;
 p/=framing;
 vec2 q=p;
 for(int i=1;i<=4;i++){
  float f=float(i);
  q+=vec2(sin(q.y*f*3.+t*.51+q.x*f*.75),cos(q.x*f*2.7-t*.36))*(.26+mid*.19)*dist/f;
 }
 float ring=length(p*vec2(.87,1.13))+sin(atan(p.y,p.x)*3.+t*.55)*.08;
 float edge=.69+bass*.10+sin(q.y*8.+t)*.06*dist;
 float body=1.-smoothstep(edge-.03,edge+.035,ring);
 float fold=sin(q.x*(4.+complexity)+q.y*7.+t*.45+bass*2.);
 float fold2=cos(q.y*9.-q.x*4.+fold*2.);
 vec3 metal=mix(a,b,.5+.5*fold);
 metal=mix(metal,c,pow(.5+.5*fold2,4.));
 float shade=.07+.64*pow(.5+.5*fold,2.);
 float glint=pow(max(0.,cos(fold2*4.+fold)),24.);
 float edgeLight=exp(-abs(ring-edge)*43.);
 vec3 col=(metal*shade + glint*(.12+bloom*.21+high*.3))*body;
 col+=mix(a,c,.5)*edgeLight*.24;
 col+=a*exp(-dot(p,p)*2.6)*.035;
 gl_FragColor=vec4(col,1.);
 #include <colorspace_fragment>
}`;
export function mountGraphics(
  canvas: HTMLCanvasElement,
  engine: AudioEngine,
  read: () => {
    scene: number;
    settings: Settings;
    reduced: boolean;
    albumColors?: CoverPalette;
  },
  stats: (fps: number) => void,
  shouldRender = () => true,
) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor("#050606");
  renderer.autoClear = false;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(46, 1, 0.06, 65);
  const overlay = new T.Scene(),
    flat = new T.Camera();
  const fade = new T.Mesh(
    new T.PlaneGeometry(2, 2),
    new T.MeshBasicMaterial({
      color: "#050606",
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  fade.frustumCulled = false;
  overlay.add(fade);
  const u = {
    t: { value: 0 },
    bass: { value: 0 },
    mid: { value: 0 },
    high: { value: 0 },
    beat: { value: 0 },
    scale: { value: 1 },
    dist: { value: 1 },
    complexity: { value: 1 },
    bloom: { value: 1 },
    kind: { value: 0 },
    a: { value: colors[0][0].clone() },
    b: { value: colors[0][1].clone() },
    c: { value: colors[0][2].clone() },
    resolution: { value: new T.Vector2() },
  };
  const pointsMaterial = new T.ShaderMaterial({
    uniforms: u,
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const surfaceMaterial = new T.ShaderMaterial({
    uniforms: u,
    vertexShader:
      "varying vec2 uv0; void main(){uv0=uv;gl_Position=vec4(position,1.);}",
    fragmentShader: liquid,
  });
  const spectrum = createSpectrum();
  const points = new T.Points(new T.BufferGeometry(), pointsMaterial);
  points.frustumCulled = false;
  const surface = new T.Mesh(new T.PlaneGeometry(2, 2), surfaceMaterial);
  surface.frustumCulled = false;
  scene.add(points, surface, spectrum.aperture);
  const rig = new T.Group();
  scene.add(rig);
  const lineMaterial = new T.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.4,
    blending: T.AdditiveBlending,
    depthWrite: false,
  });
  const starPos = new Float32Array(210 * 3),
    linkPos = new Float32Array(4200 * 6);
  const linkGeometry = new T.BufferGeometry();
  linkGeometry.setAttribute(
    "position",
    new T.BufferAttribute(linkPos, 3).setUsage(T.DynamicDrawUsage),
  );
  const links = new T.LineSegments(linkGeometry, lineMaterial);
  links.frustumCulled = false;
  scene.add(links);
  let current = -1,
    size = 0,
    frame = 0,
    last = performance.now(),
    stamp = last,
    frames = 0,
    fps = 60,
    travel = 0,
    adaptive = 1;
  let screenW = 0,
    screenH = 0,
    ratio = 0,
    drag = 0,
    lastX: number | undefined;
  const onDown = (e: PointerEvent) => {
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (lastX !== undefined) {
      drag += (e.clientX - lastX) * 0.008;
      lastX = e.clientX;
    }
  };
  const onUp = () => {
    lastX = undefined;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("lostpointercapture", onUp);
  function build(index: number) {
    current = index;
    travel = 0;
    drag = 0;
    points.geometry.dispose();
    rig.traverse((obj) => {
      if (obj instanceof T.Mesh || obj instanceof T.LineLoop)
        obj.geometry.dispose();
    });
    rig.clear();
    size = index === 0 ? 61000 : index === 1 ? 44800 : index === 4 ? 210 : 0;
    const coords = new Float32Array(size * 3),
      seeds = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const j = i * 3;
      seeds[i] = hash(i + 5);
      if (index === 0) {
        const y = 1 - (2 * (i + 0.5)) / size,
          theta = i * 2.399963,
          r = Math.sqrt(1 - y * y);
        const shell = 1.13 + Math.pow(hash(i + 42), 6) * 0.16;
        coords.set(
          [Math.cos(theta) * r * shell, y * shell, Math.sin(theta) * r * shell],
          j,
        );
      } else if (index === 1) {
        coords.set(
          [
            (((i * 133) % 160) / 159 - 0.5) * 19,
            0,
            (((i * 157) % 281) / 280 - 0.5) * 31,
          ],
          j,
        );
      } else {
        const r = Math.pow(hash(i + 11), 0.76) * 4.1;
        const spin =
          ((i % 3) * Math.PI * 2) / 3 + r * 0.88 + (hash(i + 241) - 0.5) * 0.85;
        coords.set(
          [
            Math.cos(spin) * r,
            Math.sin(spin) * r * 0.81,
            (hash(i + 99) - 0.5) * (1.65 - r * 0.19),
          ],
          j,
        );
      }
    }
    if (index === 4) starPos.set(coords);
    points.geometry = new T.BufferGeometry();
    points.geometry.setAttribute("position", new T.BufferAttribute(coords, 3));
    points.geometry.setAttribute("seed", new T.BufferAttribute(seeds, 1));
    points.visible = size > 0;
    surface.visible = index === 3;
    spectrum.aperture.visible = index === 5;
    if (index === 5) spectrum.reset();
    links.visible = index === 4;
    if (index === 2)
      for (let i = 0; i < 36; i++) {
        const n = 72,
          vertices = [];
        for (let j = 0; j < n; j++) {
          const angle = (j / n) * Math.PI * 2,
            r = 2.55 + 0.38 * Math.cos(angle * 6) + 0.17 * Math.cos(angle * 12);
          vertices.push(
            Math.cos(angle) * r,
            Math.sin(angle) * r,
            Math.sin(angle * 6) * 0.48,
          );
        }
        const geometry = new T.BufferGeometry().setAttribute(
          "position",
          new T.Float32BufferAttribute(vertices, 3),
        );
        rig.add(new T.LineLoop(geometry, lineMaterial));
      }
    renderer.clear();
  }
  let lastAlbum: CoverPalette | undefined;
  const album = new Array(3).fill(null).map(() => new T.Color());
  function loop(now: number) {
    frame = requestAnimationFrame(loop);
    if (!shouldRender()) {
      last = stamp = now;
      frames = 0;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frames++;
    if (now - stamp > 1300) {
      fps = Math.round((frames * 1000) / (now - stamp));
      stats(fps);
      frames = 0;
      stamp = now;
      adaptive = T.MathUtils.clamp(
        adaptive + (fps < 38 ? -0.12 : fps > 55 ? 0.055 : 0),
        0.55,
        1,
      );
    }
    const { scene: index, settings: s, reduced, albumColors } = read();
    if (current !== index) build(index);
    const W = canvas.clientWidth,
      H = canvas.clientHeight;
    const pixel =
      Math.round(Math.min(devicePixelRatio, 1.65) * s.quality * adaptive * 20) /
      20;
    if (W !== screenW || H !== screenH || pixel !== ratio) {
      screenW = W;
      screenH = H;
      ratio = pixel;
      renderer.setPixelRatio(pixel);
      renderer.setSize(W, H, false);
      camera.aspect = W / Math.max(1, H);
      camera.updateProjectionMatrix();
      u.resolution.value.set(W, H);
      renderer.clear();
    }
    const b = engine.sample(s.smoothing, now);
    const motion = reduced ? 0 : s.speed;
    u.t.value += dt * motion;
    const t = u.t.value;
    u.bass.value = b.bass * s.bass;
    u.mid.value = b.mid * s.mid;
    u.high.value = b.treble * s.treble;
    u.beat.value = b.beat;
    u.scale.value = pixel;
    u.kind.value = index;
    u.dist.value = s.distortion;
    u.complexity.value = s.complexity;
    u.bloom.value = s.bloom;
    if (albumColors !== lastAlbum) {
      lastAlbum = albumColors;
      albumColors?.forEach((hex, i) => album[i].set(hex));
    }
    const target = albumColors
      ? album
      : s.palette === 0
        ? sceneColors[index]
        : colors[s.palette];
    const colorset = [u.a.value, u.b.value, u.c.value];
    colorset.forEach((color, i) =>
      color.lerp(target[i], 1 - Math.exp(-dt * 9)),
    );
    const drift = reduced ? 0 : s.camera;
    camera.position.set(0, 0, 4.55);
    camera.lookAt(0, 0, 0);
    points.rotation.set(0, 0, 0);
    if (index === 0) {
      points.rotation.y = t * 0.24 * drift + drag;
      points.rotation.x = 0.12 + Math.sin(t * 0.4) * 0.22 * drift;
      camera.position.z =
        Math.max(4.3, 3.6 / camera.aspect) - b.beat * 0.13 * drift;
    }
    if (index === 1) {
      camera.position.set(Math.sin(t * 0.3) * drift + drag * 0.3, 2.4, 5.4);
      camera.lookAt(0, -0.13, -6.4);
    }
    if (index === 4) {
      camera.position.z = Math.max(8.9, 8.1 / camera.aspect);
      points.rotation.y = t * 0.18 * drift + drag;
      links.rotation.copy(points.rotation);
      let segments = 0;
      const count = Math.floor(210 * s.density),
        reach = 0.52 + u.mid.value * 0.44 + s.complexity * 0.2;
      for (let i = 0; i < count; i++)
        for (let j = i + 1; j < count && segments < 4200; j++) {
          const a = i * 3,
            k = j * 3;
          const dx = starPos[a] - starPos[k],
            dy = starPos[a + 1] - starPos[k + 1],
            dz = starPos[a + 2] - starPos[k + 2];
          if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
          for (const [n, base] of [
            [0, a],
            [3, k],
          ]) {
            const x = starPos[base],
              y = starPos[base + 1],
              z = starPos[base + 2];
            const seed = hash(base / 3 + 5),
              factor = 1 + u.bass.value * 0.3,
              px = x * factor;
            linkPos[segments * 6 + n] =
              px +
              Math.sin(z * factor * 1.8 + t + seed) *
                u.mid.value *
                0.9 *
                s.distortion;
            linkPos[segments * 6 + n + 1] =
              y * factor +
              Math.cos(px + t * 0.8 + seed) * u.bass.value * 0.6 * s.distortion;
            linkPos[segments * 6 + n + 2] = z * factor;
          }
          segments++;
        }
      linkGeometry.setDrawRange(0, segments * 2);
      linkGeometry.attributes.position.needsUpdate = true;
    }
    if (index === 2) {
      camera.position.set(
        Math.sin(t * 0.8) * 0.37 * drift,
        Math.cos(t * 0.62) * 0.22 * drift,
        0,
      );
      camera.lookAt(0, 0, -5);
      travel += dt * motion * (2.1 + u.bass.value * 8);
      rig.children.forEach((ring, i) => {
        const span = 43.2,
          z = ((i * 1.2 + travel) % span) - span + 0.15;
        ring.visible = z < -0.25 && i < 36 * s.density;
        ring.position.z = z;
        ring.rotation.z = i * 0.19 + t * 0.24 + drag;
        ring.position.x = Math.sin(z * 0.22 + t * 0.5) * 0.5 * s.camera;
        ring.scale.setScalar(
          1 + Math.sin(i * 0.6 + t) * 0.19 * s.distortion + u.mid.value * 0.16,
        );
      });
    }
    if (index === 5) {
      const hz = (engine.context?.sampleRate ?? 48000) / 2048;
      spectrum.sample(engine.bins, hz, dt, s.bass, s.mid, s.treble);
      spectrum.view(camera.aspect, drag);
    }
    lineMaterial.color
      .copy(colorset[0])
      .lerp(colorset[1], index === 2 ? 0.15 + b.beat * 0.7 : b.beat * 0.78);
    lineMaterial.opacity = (index === 2 ? 0.64 : 0.24) + s.bloom * 0.12;
    points.geometry.setDrawRange(
      0,
      Math.floor(size * s.density * (index === 4 ? 1 : adaptive)),
    );
    fade.material.opacity =
      reduced || index === 3 || index === 5 ? 1 : 1 - s.trails * (0.75 + b.energy * 0.15);
    renderer.render(overlay, flat);
    renderer.clearDepth();
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(frame);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("lostpointercapture", onUp);
    scene.remove(spectrum.aperture);
    spectrum.dispose();
    scene.traverse((obj) => {
      if (
        obj instanceof T.Points ||
        obj instanceof T.Mesh ||
        obj instanceof T.Line
      )
        obj.geometry.dispose();
    });
    fade.geometry.dispose();
    fade.material.dispose();
    pointsMaterial.dispose();
    surfaceMaterial.dispose();
    lineMaterial.dispose();
    renderer.dispose();
  };
}
