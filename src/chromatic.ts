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
export const spectrumFragment = `
uniform vec3 a,b,c;
uniform float high,bloom;
uniform float levels[36],peaks[36];
uniform vec2 resolution;
varying vec2 uv0;
void main(){
 vec3 paper=vec3(.0058,.0065,.006);
 vec2 p=(uv0-vec2(.105,.25))/vec2(.79,.49);
 vec3 color=paper;
 if(p.x>=0. && p.x<1. && p.y>=0. && p.y<=1.){
  float x=p.x*36.;
  int i=int(floor(x));
  float gap=abs(fract(x)-.5);
  float fill=1.-smoothstep(.34,.44,gap);
  float v=levels[i];
  float peak=peaks[i];
  vec3 ink=mix(a,b,smoothstep(0.,1.,p.x));
  float intensity=.32+.63*clamp(p.y,0.,1.);
  float row=exp(-abs(fract(p.y*4.+.5)-.5)*105.);
  color+=vec3(.022)*row;
  color+=ink*intensity*fill*step(p.y,v)*step(.004,v);
  float marker=1.-smoothstep(.004,.008,abs(p.y-peak));
  color+=mix(ink,c,.7)*marker*fill*step(.082,peak)*(.6+bloom*.2);
 }
 gl_FragColor=vec4(color,1.);
 #include <colorspace_fragment>
}`;
