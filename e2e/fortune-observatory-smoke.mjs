import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
const base=process.env.FORTUNE_BASE_URL ?? "http://127.0.0.1:5197";
const output=process.env.FORTUNE_EVIDENCE_DIR ?? join(tmpdir(), "toonstudio-fortune-evidence"); await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.FORTUNE_CHROME_PATH ?? (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined),headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/api/fortune/**',r=>r.abort());
try {
  await page.goto(`${base}/fortune`,{waitUntil:'domcontentloaded',timeout:120000});
  await page.getByRole('heading',{name:/운세 관측소/}).waitFor({timeout:120000});
  await page.screenshot({path:`${output}/desktop.png`,fullPage:true});
  // The cinematic hero now launches daily fortune; use the stable experience route for saju.
  await page.goto(`${base}/fortune?content=saju`);
  const birthday=page.getByPlaceholder('1990-06-15').first(); await birthday.fill('2023-02-29');
  await page.getByRole('button',{name:'사주팔자 열기',exact:true}).click(); await page.getByRole('alert').filter({hasText:'존재하지 않는'}).waitFor();
  await birthday.fill('1990-06-15'); await page.getByRole('button',{name:'사주팔자 열기',exact:true}).click();
  await page.getByRole('heading',{name:'나의 해석 리포트',exact:true}).waitFor();
  if(!await page.getByText('집계 제외',{exact:false}).count())throw Error('Unknown birth hour was not excluded');
  await page.screenshot({path:`${output}/saju.png`,fullPage:true});
  await page.getByRole('button',{name:'해석 보관',exact:true}).click();
  const stored=await page.evaluate(()=>localStorage.getItem('toonstudio-fortune-observatory-v1'));
  if(stored.includes('1990-06-15'))throw Error('Birth date leaked to notebook');
  await page.goto(`${base}/fortune?content=almanac`); await page.getByLabel('조회할 달',{exact:true}).fill('2024-02'); await page.getByRole('button',{name:'만세력 달력 열기',exact:true}).click();
  await page.getByRole('button',{name:/2024-02-29 음력/}).click(); await page.getByText('2024-02-29 ·',{exact:false}).waitFor();
  await page.screenshot({path:`${output}/almanac.png`,fullPage:true});
  await page.goto(`${base}/fortune?content=team-match`);
  await page.getByPlaceholder('1990-06-15').nth(0).fill('1990-06-15'); await page.getByPlaceholder('1990-06-15').nth(1).fill('1992-11-23');
  await page.getByRole('button',{name:'협업 궁합 열기',exact:true}).click(); await page.getByRole('heading',{name:'상대의 원국',exact:true}).waitFor();
  await page.goto(`${base}/fortune?content=tarot-three`); await page.getByRole('radio').nth(4).check();
  await page.getByRole('button',{name:'3카드 타로 열기',exact:true}).click(); await page.getByRole('button',{name:'상세 리포트',exact:true}).click(); await page.locator('.fo-tarot-results figure').nth(2).waitFor();
  await page.setViewportSize({width:390,height:844}); await page.screenshot({path:`${output}/tarot-mobile.png`,fullPage:true});
  await page.goto(`${base}/fortune`); await page.getByRole('heading',{name:/운세 관측소/}).waitFor();
  await page.screenshot({path:`${output}/mobile.png`,fullPage:true});
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw Error(`horizontal overflow at ${width}`);}
  await page.getByRole('button',{name:/나의 보관함/}).click(); await page.getByRole('button',{name:'즐겨찾기·보관함 비우기',exact:true}).click();
  if(await page.evaluate(()=>localStorage.getItem('toonstudio-fortune-observatory-v1'))!==null)throw Error('notebook was not deleted');
  if(errors.length)throw Error(`Unexpected browser errors: ${errors.join("; ")}`);
  await writeFile(`${output}/result.json`,JSON.stringify({passed:true,errors},null,2)); console.log(JSON.stringify({passed:true,errors}));
} catch(error){await page.screenshot({path:`${output}/failure.png`,fullPage:true}); console.error(error); await writeFile(`${output}/result.json`,JSON.stringify({passed:false,error:String(error),errors},null,2));process.exitCode=1;}
finally{await browser.close();}
