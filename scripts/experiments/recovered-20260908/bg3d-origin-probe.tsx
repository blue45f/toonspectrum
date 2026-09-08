import { View } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import React, { useRef } from "react";
import { createRoot } from "react-dom/client";
import { Vector4 } from "three";
import { WebGPURenderer } from "three/webgpu";

import { StudioBg3dViewFrameClear } from "@/domains/creator/bg3d/StudioBg3dViewFrameClear";

const state = window as typeof window & { samples: unknown[]; wake?: () => void };
state.samples = [];
function RootControl() { const invalidate = useThree(s=>s.invalidate); state.wake = invalidate; return null; }
function Probe() {
 useFrame((s) => {
  const rect=s.gl.domElement.getBoundingClientRect();
  const viewport=s.gl.getViewport(new Vector4()).toArray();
  state.samples.push({size:{...s.size},rect:{top:rect.top,left:rect.left,width:rect.width,height:rect.height},viewport,projection:s.camera.projectionMatrix.toArray()});
  if(state.samples.length>120)state.samples.shift();
 }, 2);
 return null;
}
function App() {
 const host=useRef<HTMLDivElement>(null);
 return <><style>{`@keyframes entering { from { transform:translateY(18px); } to { transform:translateY(0); } } #host { animation:entering 420ms ease-out both; }`}</style><div id="host" ref={host} style={{position:"absolute",left:80,top:60,width:600,height:420}}>
  <Canvas frameloop="demand" camera={{position:[4,3,5],fov:50}} dpr={1} gl={async (defaults)=>{ if (!(defaults.canvas instanceof HTMLCanvasElement)) throw new Error('This browser probe requires a DOM canvas.'); const gl=new WebGPURenderer({canvas:defaults.canvas,antialias:true});await new Promise(resolve=>setTimeout(resolve,600));await gl.init();return gl; }}>
   <RootControl/><StudioBg3dViewFrameClear />
   <View track={host as React.RefObject<HTMLElement>}>
    <color attach="background" args={["#eeeeee"]}/>
    <mesh><boxGeometry/><meshBasicMaterial color="#3366bb"/></mesh>
    <gridHelper args={[20,20]}/>
   </View>
   <Probe/>
  </Canvas>
 </div></>
}
createRoot(document.getElementById("root")!).render(<App/>);
