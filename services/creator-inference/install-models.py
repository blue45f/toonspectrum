"""Explicit operator-run acquisition. Never called by an API request or service startup.
Each selected model requires a reviewed immutable revision and explicit license acknowledgement.
"""
import argparse, hashlib, json, re
from pathlib import Path
MODELS={
 'wan':('Wan-AI/Wan2.1-I2V-14B-480P-Diffusers',['*.json','*.safetensors','*.txt','*.model','LICENSE*','README*']),
 'triposr':('stabilityai/TripoSR',['config.yaml','model.ckpt','LICENSE*','README*']),
 'dino':('facebook/dino-vitb16',['config.json','LICENSE*','README*']),
 'sdxl':('stabilityai/stable-diffusion-xl-base-1.0',['*.json','*.safetensors','*.txt','*.model','LICENSE*','README*']),
 'controlnet':('diffusers/controlnet-canny-sdxl-1.0',['config.json','*.safetensors','LICENSE*','README*']),
}
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('model',choices=MODELS);parser.add_argument('--revision',required=True)
 parser.add_argument('--directory',type=Path,required=True);parser.add_argument('--accept-model-license',action='store_true')
 args=parser.parse_args()
 if not args.accept_model_license or not re.fullmatch('[a-f0-9]{40}',args.revision):parser.error('Review the model license and provide its immutable 40-hex revision')
 from huggingface_hub import snapshot_download
 repo,patterns=MODELS[args.model];root=args.directory.resolve();dest=root/args.model
 snapshot_download(repo_id=repo,revision=args.revision,local_dir=dest,allow_patterns=patterns,ignore_patterns=['*.bin','*.pt','*.pth','*.onnx','*.py','*.msgpack'])
 hashes={}
 for path in sorted(dest.rglob('*')):
  if not path.is_file() or '.cache' in path.parts:continue
  digest=hashlib.sha256()
  with path.open('rb') as stream:
   for block in iter(lambda:stream.read(8*1024*1024),b''):digest.update(block)
  hashes[str(path.relative_to(dest))]=digest.hexdigest()
 record={'repository':repo,'revision':args.revision,'licenseAcknowledged':True,'files':hashes}
 (root/f'{args.model}-manifest.json').write_text(json.dumps(record,indent=2))
 print(f'Acquired {repo}@{args.revision}; {len(hashes)} files hashed. Run real inference acceptance tests before enabling the engine.')
if __name__=='__main__':main()
