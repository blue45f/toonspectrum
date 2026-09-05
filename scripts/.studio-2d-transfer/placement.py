import json, pathlib
root=pathlib.Path('.')
base=root/'src/domains/creator'
paths=json.loads((root/'artifacts/studio-2d/finalized-paths.json').read_text())
def once(text,old,new):
    assert text.count(old)==1, old[:80]
    return text.replace(old,new,1)
p=base/'studio-2d-source-size.ts'
text=p.read_text()
text='import { createCanvasImageElement } from "./studio-image-placement";\n\n'+text
text+='''
/** Shared by the production editor and browser tests, preserving the existing placement policy. */
export function createStudio2dCanvasImage(
  source: { readonly width?: number; readonly height?: number },
  input: { id: string; src: string; canvasWidth: number; canvasHeight: number },
) {
  const size = studio2dSourceSize(source);
  return createCanvasImageElement({
    ...input,
    sourceWidth: size.width,
    sourceHeight: size.height,
    horizontalInset: 0,
    minY: 0,
  });
}
'''
p.write_text(text)
p=base/'StudioCuttoonEditorHost.tsx';text=p.read_text()
text=once(text,'import { studio2dSourceSize } from "./studio-2d-source-size";', 'import { createStudio2dCanvasImage } from "./studio-2d-source-size";')
start=text.index('  function addBgScene(bg: StudioBgScene) {');end=text.index('\n  // AI로 생성된 배경',start)
part=text[start:end]
part=once(part,'    const sourceSize = studio2dSourceSize(bg);\n    const el = createCanvasImageElement({','    const el = createStudio2dCanvasImage(bg, {')
part=once(part,'      sourceWidth: sourceSize.width,\n      sourceHeight: sourceSize.height,\n      horizontalInset: 0,\n      minY: 0,\n','')
text=text[:start]+part+text[end:]
assert len(text.split('\n'))<=29482, 'host architecture ceiling'
p.write_text(text)
p=base/'studio-2d-source-size.test.ts';text=p.read_text()
text=once(text,'import { studio2dSourceSize }','import { createStudio2dCanvasImage, studio2dSourceSize }')
text=once(text,'      expect(Math.abs(image.height - image.width * asset.height / asset.width)).toBeLessThanOrEqual(1);','      expect(Math.abs(image.height - image.width * asset.height / asset.width)).toBeLessThanOrEqual(1);\n      expect(createStudio2dCanvasImage(scene, { id: scene.id, src: scene.imgSrc!, canvasWidth: 720, canvasHeight: 1080 })).toEqual(image);')
text=once(text,'    expect(insertion).toContain("studio2dSourceSize(bg)");\n    expect(insertion).toContain("sourceWidth: sourceSize.width");\n    expect(insertion).toContain("sourceHeight: sourceSize.height");', '    expect(insertion).toContain("createStudio2dCanvasImage(bg, {");\n    expect(insertion).not.toContain("sourceWidth: 720");')
p.write_text(text)
p=root/'scripts/studio-2d-browser-smoke.mjs';text=p.read_text()
text=once(text,"import {studio2dSourceSize} from '../src/domains/creator/studio-2d-source-size';\nimport {createCanvasImageElement} from '../src/domains/creator/studio-image-placement';", "import {createStudio2dCanvasImage} from '../src/domains/creator/studio-2d-source-size';")
text=once(text,"const size=studio2dSourceSize(s);setPlaced(JSON.stringify(createCanvasImageElement({id:s.id,src:s.imgSrc??'',canvasWidth:720,canvasHeight:1080,sourceWidth:size.width,sourceHeight:size.height,horizontalInset:0,minY:0})));", "setPlaced(JSON.stringify(createStudio2dCanvasImage(s,{id:s.id,src:s.imgSrc??'',canvasWidth:720,canvasHeight:1080})));")
p.write_text(text)
print('Shared placement helper connected; architecture ceiling preserved.')
