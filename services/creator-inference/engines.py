"""Real local-model adapters. Model loading never downloads code or weights at request time."""
from __future__ import annotations
import importlib.util, json, os, shutil, subprocess, sys
from pathlib import Path

MODEL_IDS = {'wan':'Wan-AI/Wan2.1-I2V-14B-480P-Diffusers','triposr':'stabilityai/TripoSR','sdxl':'stabilityai/stable-diffusion-xl-base-1.0','controlnet':'diffusers/controlnet-canny-sdxl-1.0'}
def model_root():return Path(os.environ.get('CREATOR_MODEL_ROOT','/models')).resolve()
def capabilities():
    root=model_root();triposr=Path(os.environ.get('CREATOR_TRIPOSR_CODE','/opt/TripoSR'))
    installed=lambda name:importlib.util.find_spec(name) is not None
    common=installed('torch') and installed('diffusers') and installed('transformers') and installed('accelerate')
    flags={
        'image-to-video':common and (root/'wan/model_index.json').is_file() and (root/'wan/image_encoder/config.json').is_file() and bool(shutil.which('ffmpeg')),
        'image-to-3d':all(installed(n) for n in ['torch','torchmcubes','omegaconf','einops','trimesh']) and (root/'dino/config.json').is_file() and (triposr/'tsr/system.py').is_file() and (root/'triposr/config.yaml').is_file() and (root/'triposr/model.ckpt').is_file(),
        'model-to-2d':common and installed('cv2') and (root/'sdxl/model_index.json').is_file() and (root/'controlnet/config.json').is_file() and bool(shutil.which(os.environ.get('CREATOR_BLENDER','blender'))),
    }
    return {'enabled':os.environ.get('CREATOR_INFERENCE_ENABLED')=='1','engines':{mode:{'configured':bool(value),'model':{'image-to-video':'Wan2.1 I2V','image-to-3d':'TripoSR','model-to-2d':'Blender + SDXL ControlNet'}[mode],'validation':'GPU smoke test required; configuration is not an inference-quality guarantee'} for mode,value in flags.items()},'networkRequiredAfterSetup':False,'apiKeyExposedToClient':False}

def progress(directory,percent,stage):
    tmp=directory/'progress.tmp';tmp.write_text(json.dumps({'progress':int(percent),'stage':stage}));tmp.replace(directory/'progress.json')

def tensor_device():
    import torch
    device=os.environ.get('CREATOR_TORCH_DEVICE','cuda')
    if device=='cuda' and not torch.cuda.is_available():raise RuntimeError('CUDA is required for the configured diffusion engines')
    return device

def callback(directory,start,span,steps,stage):
    def step(_pipe,index,_time,values):progress(directory,start+span*(index+1)/steps,stage);return values
    return step

def video(directory,request):
    import torch
    from PIL import Image, ImageOps
    from diffusers import AutoencoderKLWan, WanImageToVideoPipeline, UniPCMultistepScheduler
    from diffusers.utils import export_to_video
    from transformers import CLIPVisionModel
    device=tensor_device()
    if device!='cuda':raise RuntimeError('Video diffusion requires a CUDA worker')
    model=model_root()/'wan';progress(directory,2,'loading-wan')
    vae=AutoencoderKLWan.from_pretrained(str(model),subfolder='vae',torch_dtype=torch.float32,local_files_only=True,use_safetensors=True)
    encoder=CLIPVisionModel.from_pretrained(str(model),subfolder='image_encoder',torch_dtype=torch.float32,local_files_only=True,use_safetensors=True)
    dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    pipe=WanImageToVideoPipeline.from_pretrained(str(model),vae=vae,image_encoder=encoder,torch_dtype=dtype,local_files_only=True,use_safetensors=True)
    pipe.scheduler=UniPCMultistepScheduler.from_config(pipe.scheduler.config,flow_shift=3.0)
    pipe.enable_model_cpu_offload();pipe.vae.enable_tiling()
    clips=[];timings=[];fps=16;count=len(request['inputs'])
    for i,path in enumerate(request['inputs']):
        with Image.open(path) as source:
            rgba=source.convert('RGBA');background=Image.new('RGBA',rgba.size,'white');background.alpha_composite(rgba)
            image=ImageOps.pad(background.convert('RGB'),(832,480),color='white')
        frames=pipe(image=image,prompt=request['prompt']+', preserve the source character appearance, coherent animated motion',negative_prompt=request['negativePrompt'] or 'deformed face, extra limbs, inconsistent character, text artifacts, flicker',width=832,height=480,num_frames=request['frames'],num_inference_steps=request['steps'],guidance_scale=5.0,generator=torch.Generator(device='cpu').manual_seed(request['seed']+i),output_type='pil',callback_on_step_end=callback(directory,5+85*i/count,85/count,request['steps'],f'generating-shot-{i+1}')).frames[0]
        name=f'clip-{i:03d}.mp4';export_to_video(frames,str(directory/name),fps=fps);clips.append(name)
        timings.append({'shot':i+1,'asset':request['assets'][i],'seed':request['seed']+i,'frames':len(frames),'seconds':len(frames)/fps,'caption':request['captions'][i]})
        if i==0:frames[0].save(directory/'preview.png')
        del frames
    progress(directory,92,'assembling-generated-shots')
    (directory/'concat.txt').write_text(''.join(f"file '{name}'\n" for name in clips))
    subprocess.run(['ffmpeg','-nostdin','-y','-v','error','-f','concat','-safe','1','-i',str(directory/'concat.txt'),'-c','copy','-movflags','+faststart',str(directory/'animation.mp4')],check=True,timeout=180)
    def srt_time(seconds):
        ms=round(seconds*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    cursor=0;subtitles=[]
    for i,shot in enumerate(timings):
        subtitles.append(f"{i+1}\n{srt_time(cursor)} --> {srt_time(cursor+shot['seconds'])}\n{shot['caption'] or ' '}\n")
        cursor+=shot['seconds']
    (directory/'captions.srt').write_text('\n'.join(subtitles),encoding='utf8')
    (directory/'storyboard.json').write_text(json.dumps({'format':'toonstudio-generated-animation','version':1,'model':MODEL_IDS['wan'],'fps':fps,'shots':timings,'disclosure':'AI-generated frames; character identity and motion are not guaranteed'},ensure_ascii=False,indent=2),encoding='utf8')
    return ['animation.mp4','preview.png','captions.srt','storyboard.json']

def mesh(directory,request):
    import numpy as np
    import torch
    from PIL import Image
    code=Path(os.environ.get('CREATOR_TRIPOSR_CODE','/opt/TripoSR')).resolve()
    if not (code/'tsr/system.py').is_file():raise RuntimeError('Reviewed TripoSR source is not installed')
    sys.path.insert(0,str(code));from tsr.system import TSR
    device=tensor_device();progress(directory,3,'preparing-subject')
    image=Image.open(request['inputs'][0]).convert('RGBA')
    if image.getchannel('A').getextrema()==(255,255):
        weights=model_root()/'rembg/u2net.onnx'
        if not weights.is_file():raise RuntimeError('Use a transparent PNG subject or install reviewed local u2net background-removal weights')
        import rembg
        os.environ['U2NET_HOME']=str(weights.parent)
        image=rembg.remove(image,session=rembg.new_session('u2net',providers=['CPUExecutionProvider']))
    bounds=image.getchannel('A').getbbox()
    if not bounds:raise ValueError('The source image has no visible subject')
    image=image.crop(bounds);image.thumbnail((435,435));frame=Image.new('RGBA',(512,512),(128,128,128,255));frame.alpha_composite(image,((512-image.width)//2,(512-image.height)//2));frame=frame.convert('RGB');frame.save(directory/'preview.png')
    from omegaconf import OmegaConf
    cfg=OmegaConf.load(model_root()/'triposr/config.yaml');OmegaConf.resolve(cfg)
    # Upstream's DINO tokenizer calls hf_hub_download('facebook/dino-vitb16').
    # Override just configuration loading; weights still come from the reviewed TSR checkpoint.
    cfg.image_tokenizer_cls='local_dino.LocalDINOImageTokenizer'
    model=TSR(cfg)
    model.load_state_dict(torch.load(model_root()/'triposr/model.ckpt',map_location='cpu',weights_only=True))
    model.renderer.set_chunk_size(8192);model.to(device)
    progress(directory,30,'inferring-3d-field')
    with torch.no_grad():
        codes=model([frame],device=device)
        progress(directory,60,'extracting-mesh')
        meshes=model.extract_mesh(codes,True,resolution=256)
    if not meshes or len(meshes[0].faces)==0:raise RuntimeError('Model produced empty geometry')
    meshes[0].export(str(directory/'character.glb'))
    return ['character.glb','preview.png']

def illustration(directory,request):
    import cv2
    import numpy as np
    import torch
    from PIL import Image
    from diffusers import ControlNetModel, StableDiffusionXLControlNetImg2ImgPipeline, AutoencoderKL
    device=tensor_device()
    if device!='cuda':raise RuntimeError('SDXL requires a CUDA worker')
    progress(directory,3,'rendering-3d-source')
    blender=shutil.which(os.environ.get('CREATOR_BLENDER','blender'))
    if not blender:raise RuntimeError('Blender is not installed')
    subprocess.run([blender,'--background','--factory-startup','--disable-autoexec','--python',str(Path(__file__).with_name('render_blender.py')),'--',request['inputs'][0],str(directory/'source.png'),str(request['yaw'])],check=True,timeout=300)
    image=Image.open(directory/'source.png').convert('RGB');edges=cv2.Canny(np.array(image),100,200);control=Image.fromarray(np.repeat(edges[:,:,None],3,axis=2));control.save(directory/'structure.png')
    root=model_root();progress(directory,20,'loading-sdxl-controlnet')
    net=ControlNetModel.from_pretrained(str(root/'controlnet'),torch_dtype=torch.float16,local_files_only=True,use_safetensors=True)
    vae=AutoencoderKL.from_pretrained(str(root/'sdxl'),subfolder='vae',torch_dtype=torch.float32,local_files_only=True,use_safetensors=True)
    pipe=StableDiffusionXLControlNetImg2ImgPipeline.from_pretrained(str(root/'sdxl'),controlnet=net,vae=vae,torch_dtype=torch.float16,local_files_only=True,use_safetensors=True)
    pipe.enable_model_cpu_offload();pipe.enable_vae_tiling()
    output=pipe(prompt='2D webtoon character illustration, clean linework, cel shading, preserve source pose and silhouette. '+request['prompt'],negative_prompt=request['negativePrompt'] or 'extra limbs, malformed hands, deformed face, text, watermark',image=image,control_image=control,strength=request['strength'],controlnet_conditioning_scale=1.0,num_inference_steps=request['steps'],guidance_scale=6.0,generator=torch.Generator(device='cpu').manual_seed(request['seed']),callback_on_step_end=callback(directory,25,65,max(1,int(request['steps']*request['strength'])),'stylizing-3d-render')).images[0]
    output.save(directory/'illustration.png')
    return ['illustration.png','source.png','structure.png']

def main():
    directory=Path(sys.argv[1]).resolve();request=json.loads((directory/'request.json').read_text())
    from contracts import validate_job, validate_glb
    original={key:value for key,value in request.items() if key!='inputs'};validate_job(original)
    if request['mode']=='model-to-2d':validate_glb(Path(request['inputs'][0]))
    function={'image-to-video':video,'image-to-3d':mesh,'model-to-2d':illustration}[request['mode']]
    artifacts=function(directory,request)
    metadata={'version':1,'mode':request['mode'],'seed':request['seed'],'modelIds':MODEL_IDS,'sourceAssets':request['assets'],'generated':True}
    manifest=model_root()/'manifest.json'
    if manifest.exists():metadata['installedModelManifest']=json.loads(manifest.read_text())
    (directory/'provenance.json').write_text(json.dumps(metadata,indent=2));artifacts.append('provenance.json')
    (directory/'result.json').write_text(json.dumps({'artifacts':artifacts}));progress(directory,95,'validating-artifacts')
if __name__=='__main__':main()
