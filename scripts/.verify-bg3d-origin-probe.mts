import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
const scratch="/private/tmp/toonspectrum-all-issues-20260908/bg3d-origin-probe-cold";
mkdirSync(scratch,{recursive:true});
const vite=await createServer({root:resolve("apps/web"),configFile:resolve("vite.config.ts"),server:{host:"127.0.0.1",port:52931,strictPort:true},appType:"custom",logLevel:"warn"});
vite.middlewares.use(async(req,res,next)=>{if(req.url!=="/probe"){next();return;}res.setHeader("Content-Type","text/html");res.end(await vite.transformIndexHtml("/probe",`<!doctype html><div id="root"></div><script type="module" src="/tools/browser-harnesses/.bg3d-origin-probe.tsx"></script>`));});
await vite.listen();
const browser=await chromium.launch({channel:"chromium",headless:true,args:["--enable-unsafe-webgpu","--use-gpu-in-tests"]});
try {
 const page=await browser.newPage({viewport:{width:900,height:700}});const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.goto("http://127.0.0.1:52931/probe");
 await page.waitForFunction(()=> (window as any).samples?.length>=2,{},{timeout:90000});
 await page.locator("canvas").screenshot({path:`${scratch}/before.png`});
 const before=await page.evaluate(()=> (window as any).samples.at(-1));
 await page.locator("#host").evaluate((host)=>{(host as HTMLElement).style.animation="none"; (window as any).wake();});
 await page.waitForTimeout(600);
 await page.locator("canvas").screenshot({path:`${scratch}/after.png`});
 const after=await page.evaluate(()=> (window as any).samples.at(-1));
 writeFileSync(`${scratch}/report.json`,JSON.stringify({before,after,errors},null,2));
 console.log(JSON.stringify({before,after,errors}));
} finally {await browser.close();await vite.close();}
