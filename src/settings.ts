export const scenes = [
  ["Singularity", "#efb580", "Particle sphere"],
  ["Dreamscape", "#87baff", "Spectral terrain"],
  ["Hyperspace", "#5ce1ce", "Geometric tunnel"],
  ["Liquid", "#dfa7ee", "Iridescent surface"],
  ["Constellation", "#a9c8da", "Connected star field"],
  ["Chromatic", "#f4a464", "Radial spectrum"],
] as const;
export const defaults = {
  density: 0.86,
  bass: 1,
  mid: 1,
  treble: 1,
  speed: 1,
  camera: 0.45,
  bloom: 0.72,
  distortion: 1,
  trails: 0.45,
  complexity: 1,
  smoothing: 0.78,
  quality: 1,
  palette: 0,
  style: 0,
};
export type Settings = typeof defaults;
export const ranges: [keyof Settings, string, number, number][] = [
  ["density", "Particle density", 0.2, 1],
  ["bass", "Bass sensitivity", 0, 2],
  ["mid", "Mid sensitivity", 0, 2],
  ["treble", "Treble sensitivity", 0, 2],
  ["speed", "Motion speed", 0, 2],
  ["camera", "Camera drift", 0, 1],
  ["bloom", "Glow", 0, 1.5],
  ["distortion", "Distortion", 0, 2],
  ["trails", "Trails", 0, 1],
  ["complexity", "Geometry complexity", 0.2, 2],
  ["smoothing", "Audio smoothing", 0, 0.98],
  ["quality", "Render scale", 0.4, 1],
];
export type Preset = {
  version: 1;
  name: string;
  scene: number;
  settings: Settings;
};
export function parsePreset(input: unknown): Preset {
  const v = input as Partial<Preset> | null;
  if (
    !v ||
    v.version !== 1 ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 60 ||
    !Number.isInteger(v.scene) ||
    v.scene! < 0 ||
    v.scene! >= scenes.length ||
    !v.settings
  )
    throw Error("Invalid FLUX preset");
  const settings = { ...defaults };
  for (const [key, , min, max] of [
    ...ranges,
    ["palette", "", 0, 3],
    ["style", "", 0, 2],
  ] as typeof ranges) {
    const value = v.settings[key];
    if (typeof value === "number" && Number.isFinite(value))
      settings[key] = Math.max(min, Math.min(max, value));
  }
  settings.palette = Math.round(settings.palette);
  settings.style = Math.round(settings.style);
  return { version: 1, name: v.name.trim(), scene: v.scene!, settings };
}
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("flux-studio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("presets");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export async function presets(value?: Preset[]): Promise<Preset[]> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("presets", value ? "readwrite" : "readonly"),
        store = tx.objectStore("presets");
      const req = value ? store.put(value, "library") : store.get("library");
      tx.oncomplete = () => resolve(value ?? req.result ?? []);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
