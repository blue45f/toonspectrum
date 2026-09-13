/** Portable spatial chapter: images are embedded; remote URLs and executable content are forbidden. */
export const MAX_PANELS = 40;
export const MAX_BYTES = 48 * 1024 * 1024;
const number = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
export function validateStory(value) {
  if (!value || value.format !== 'toonstudio-spatial-story' || value.version !== 1 || typeof value.id !== 'string' || value.id.length > 100 || typeof value.title !== 'string' || value.title.length > 150 || !Array.isArray(value.panels) || !value.panels.length || value.panels.length > MAX_PANELS) throw new Error('지원하지 않거나 너무 큰 공간형 웹툰 파일입니다.');
  let bytes = 0; const ids = new Set();
  const panels = value.panels.map((panel) => {
    if (!panel || typeof panel.id !== 'string' || panel.id.length > 100 || ids.has(panel.id) || typeof panel.caption !== 'string' || panel.caption.length > 1200 || !number(panel.seconds, 3, 60) || !number(panel.aspect, .1, 10) || !Array.isArray(panel.layers) || !panel.layers.length || panel.layers.length > 4) throw new Error('컷 정보가 올바르지 않습니다.');
    ids.add(panel.id);
    const layers = panel.layers.map((layer) => {
      if (!layer || typeof layer.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(layer.image) || !number(layer.depth, 0, .35) || !number(layer.x, -.5, .5) || !number(layer.y, -.5, .5) || !number(layer.scale, .25, 1.5)) throw new Error('레이어 정보가 올바르지 않습니다.');
      bytes += layer.image.length;
      if (bytes > MAX_BYTES) throw new Error('웹툰 파일이 48MB 제한을 초과했습니다.');
      return { image: layer.image, depth: layer.depth, x: layer.x, y: layer.y, scale: layer.scale };
    });
    return { id: panel.id, caption: panel.caption, seconds: panel.seconds, aspect: panel.aspect, layers };
  });
  return { format: value.format, version: 1, id: value.id, title: value.title, panels };
}
export function makeStory() { return { format: 'toonstudio-spatial-story', version: 1, id: crypto.randomUUID(), title: '나의 공간형 웹툰', panels: [] }; }
export function panelSize(panel) { const height = Math.min(1.6, 2.4 / panel.aspect); return [height * panel.aspect, height]; }
export async function normalizedImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) throw new Error('12MB 이하 PNG/JPEG/WebP 이미지만 지원합니다.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (image.naturalWidth * image.naturalHeight > 32000000) throw new Error('이미지를 3,200만 픽셀 이하로 줄여 주세요.');
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return { image: canvas.toDataURL('image/png'), aspect: canvas.width / canvas.height };
  } finally { URL.revokeObjectURL(url); }
}
export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c=0;c<4;c++) for(let r=0;r<4;r++) for(let k=0;k<4;k++) out[c*4+r]+=a[k*4+r]*b[c*4+k];
  return out;
}
export function transform(x=0,y=0,z=0,yaw=0,sx=1,sy=1) {
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return new Float32Array([c*sx,0,-s*sx,0, 0,sy,0,0, s,0,c,0, x,y,z,1]);
}
export function perspective(aspect) { const f=1/Math.tan(Math.PI/7),n=.05,far=60; return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+n)/(n-far),-1, 0,0,2*far*n/(n-far),0]); }
export function rayHits(origin, direction, target) {
  const c=Math.cos(target.yaw),s=Math.sin(target.yaw);
  const p=[origin[0]-target.x,origin[1]-target.y,origin[2]-target.z];
  const o=[c*p[0]-s*p[2],p[1],s*p[0]+c*p[2]];
  const d=[c*direction[0]-s*direction[2],direction[1],s*direction[0]+c*direction[2]];
  if (Math.abs(d[2])<1e-6) return false;
  const t=-o[2]/d[2];
  return t>0 && t<15 && Math.abs(o[0]+d[0]*t)<=target.w/2 && Math.abs(o[1]+d[1]*t)<=target.h/2;
}
