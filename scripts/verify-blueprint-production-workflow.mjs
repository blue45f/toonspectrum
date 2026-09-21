import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const origin = process.env.STUDIO_QA_BASE_URL ?? "http://127.0.0.1:4462";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname), "Local fixture only");
const out = "artifacts/blueprint-production-workflow"; await mkdir(out, { recursive:true });
const browser = await chromium.launch(), results=[];
try {
  for (const width of [1440, 820, 390, 320]) {
    const context=await browser.newContext({viewport:{width,height:1000},locale:"ko-KR",timezoneId:"Asia/Seoul",serviceWorkers:"block"});
    await context.addInitScript(()=>{localStorage.setItem("toonspectrum-lang",JSON.stringify({state:{lang:"ko"},version:0}));});
    const page=await context.newPage(), errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    try {
      await page.goto(`${origin}/tools/browser-harnesses/blueprint-production-workflow.html`);
      const article=page.getByRole("heading",{name:"선화 원고",exact:true}).locator("xpath=ancestor::article");
      await article.getByText("단계·담당·의존성 편집",{exact:true}).click();
      const input=article.getByLabel("작업 제목",{exact:true}); await input.fill("작성 중인 입력");
      await page.getByRole("button",{name:"동일 작업 새로고침",exact:true}).click();
      await expect(input).toHaveValue("작성 중인 입력");
      await expect(article.getByRole("alert")).toHaveCount(0);
      await page.getByRole("button",{name:"일정 보기",exact:true}).click();
      const calendar=page.getByRole("region",{name:"제작 일정",exact:true});
      await calendar.getByLabel("표시할 달",{exact:true}).fill("2026-09");
      await calendar.getByRole("button",{name:/선화 원고/u}).click();
      await expect(input).toHaveValue("작성 중인 입력");
      await page.getByRole("button",{name:"외부 변경 시뮬레이션",exact:true}).click();
      await expect(input).toHaveValue("작성 중인 입력");
      await expect(article.getByRole("alert")).toContainText("다른 곳에서");
      await expect(article.getByRole("button",{name:"작업 정보 저장",exact:true})).toBeDisabled();
      await article.getByRole("button",{name:"입력 대신 최신 작업 불러오기",exact:true}).click();
      await expect(article.getByLabel("담당자 표시",{exact:true})).toHaveValue("외부 담당자");
      await expect(input).toHaveValue("선화 원고");
      const dependency=article.locator("details").last(); await dependency.locator("summary").click();
      await expect(dependency).toContainText("채색 원고");
      const views=page.locator("details").filter({has:page.locator("summary",{hasText:"내 보기 저장·불러오기"})}).first();
      await views.locator("summary").click();
      await page.getByLabel("저장된 작업 검색",{exact:true}).fill("선화");
      await page.getByLabel("작업 정렬",{exact:true}).selectOption("due");
      await views.getByLabel("보기 이름",{exact:true}).fill("원고 마감 보기");
      await views.getByRole("button",{name:"현재 조건 저장",exact:true}).click();
      await expect(views.getByRole("status")).toContainText("이 기기의 보기 설정에 반영",{timeout:30000});
      await page.reload();
      await page.getByText("내 보기 저장·불러오기",{exact:true}).click();
      await page.getByRole("button",{name:"저장된 보기 불러오기",exact:true}).click();
      await page.getByRole("button",{name:"원고 마감 보기",exact:true}).click({timeout:30000});
      await expect(page.getByLabel("저장된 작업 검색",{exact:true})).toHaveValue("선화");
      await expect(page.getByLabel("작업 정렬",{exact:true})).toHaveValue("due");
      await page.getByRole("button",{name:"원고 마감 보기 보기 삭제",exact:true}).click();
      await expect(page.getByRole("button",{name:"원고 마감 보기",exact:true})).toHaveCount(0);
      await page.getByRole("button",{name:"다른 작품으로",exact:true}).click();
      await expect(page.getByLabel("저장된 작업 검색",{exact:true})).toHaveValue("");
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`No page overflow at ${width}`);
      const axe=await new AxeBuilder({page}).include("main").withTags(["wcag2a","wcag2aa"]).analyze();
      assert.deepEqual(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
      assert.deepEqual(errors,[]);
      await page.screenshot({path:`${out}/${width}.png`,fullPage:true});
      results.push({width,result:"passed",localViews:"real SQLite/OPFS save/reload/delete",taskWrites:"synthetic fixture only",accessibilityViolations:0});
      console.log(`PASS blueprint production ${width}`);
    } catch(error) {console.error("Fixture page errors", errors);await page.screenshot({path:`${out}/${width}-failed.png`,fullPage:true}).catch(()=>{});throw error;}
    finally {await context.close();}
  }
} finally {await browser.close(); await writeFile(`${out}/report.json`,JSON.stringify({results},null,2));}
