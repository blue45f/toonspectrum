import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin=new URL(process.env.STUDIO_QA_BASE_URL??"");
assert(["127.0.0.1","localhost"].includes(origin.hostname)&&!origin.username&&!origin.password&&origin.pathname==="/");
const output=path.resolve(".qa/virtual-studio-private-room");await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"]});
const errors=[],requests=[],results=[];
const world={worldId:"private-world",revisionId:"published-1",contentHash:"a".repeat(64)};
let door={epoch:null,open:false,allowed:[]},lostOpen=false,lostAction=false;
const sessions=new Map(),receipts=new Map(),conversations=new Map(),pages=[];
const now=()=>new Date(Date.now()+15000).toISOString();
function hint(record){for(const member of record.members){const index=Number(member.binding.clientInstanceId.split("-")[1]);
  void pages[index]?.evaluate(value=>window.privateFixture.hint(value),{version:1,workId:"private-qa",conversationId:record.conversationId,selfSessionEpoch:member.sessionEpoch}).catch(()=>{});}}
for(let index=0;index<2;index++){
  const context=await browser.newContext({permissions:["camera","microphone"],viewport:{width:1280,height:900}}),page=await context.newPage();pages.push(page);
  await page.addInitScript(()=>{
    window.qaCaptureCalls=0;window.qaStopped=0;window.qaPcs=[];window.qaHeld=[];window.qaHoldCapture=false;
    const Native=window.RTCPeerConnection;window.RTCPeerConnection=new Proxy(Native,{construct(target){const pc=new target({iceServers:[]});window.qaPcs.push(pc);return pc;}});
    const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async constraints=>{window.qaCaptureCalls++;const stream=await get(constraints);
      for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{window.qaStopped++;stop();};}
      if(window.qaHoldCapture)return new Promise(resolve=>window.qaHeld.push(()=>resolve(stream)));return stream;};
  });
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/*",async route=>{
    const request=route.request(),url=new URL(request.url());if(url.origin!==origin.origin)return route.abort();if(!url.pathname.startsWith("/api/"))return route.continue();
    try{
      const actor=`actor-${index}`,suffix=url.pathname.split("/acoustic/")[1],input=request.method()==="POST"?request.postDataJSON():null,key=request.headers()["idempotency-key"];
      requests.push({actor,path:url.pathname,method:request.method(),input,key});
      const respond=json=>route.fulfill({json}),deny=status=>route.fulfill({status,json:{message:"Synthetic fixture authority denied"}});
      if(url.pathname.endsWith("/team"))return respond({workId:"private-qa",viewer:{userId:actor,role:index?"editor":"owner",status:"active",capabilities:{view:true,edit:true,comment:true,manageMembers:index===0,respondInvite:false}},members:[0,1].map(i=>({userId:`actor-${i}`,name:i?"팀원 B":"관리자 A",image:"",role:i?"editor":"owner",status:"active",isOwner:i===0}))});
      if(suffix==="zones/private-zone/door")return respond({world,zoneId:"private-zone",doorId:"review-door",epoch:door.epoch,open:door.open,permitted:door.open&&door.allowed.includes(actor),...(index===0?{allowedUserIds:door.allowed}:{})});
      if(suffix==="door"){
        assert.equal(index,0);assert.equal(input.expectedDoorEpoch,door.epoch);door={epoch:randomUUID(),open:input.open,allowed:input.allowedUserIds};
        sessions.clear();for(const record of conversations.values()){record.status="revoked";record.reason="authority_lost";hint(record);}return respond({door,replayed:false});}
      if(suffix==="sessions/read-open-intent"){const receipt=receipts.get(`${actor}:${key}`);if(!receipt)return respond({lease:null});assert.deepEqual(receipt.input,input);return respond({lease:sessions.get(receipt.epoch)??null});}
      if(suffix==="sessions/open"){
        assert.equal(input.connectionId,`socket-${index}`);assert.equal(input.clientInstanceId,`client-${index}`);assert.equal(input.doorEpoch,door.epoch);if(!door.open||!door.allowed.includes(actor))return deny(403);
        assert(!receipts.has(`${actor}:${key}`),"The client must never repeat an ambiguous open POST");
        const lease={kind:"acoustic-session-lease-only",world,zoneId:"private-zone",doorId:"review-door",doorEpoch:door.epoch,sessionEpoch:randomUUID(),leaseRevision:"1",expiresAt:now(),binding:{connectionId:input.connectionId,clientInstanceId:input.clientInstanceId,joinedAt:new Date().toISOString()}};
        sessions.set(lease.sessionEpoch,lease);receipts.set(`${actor}:${key}`,{input,epoch:lease.sessionEpoch});if(lostOpen){lostOpen=false;return route.abort("failed");}return respond(lease);}
      if(suffix==="sessions/close"){sessions.delete(input.sessionEpoch);for(const record of conversations.values())if(record.members.some(member=>member.sessionEpoch===input.sessionEpoch)){record.status="revoked";record.reason="left";hint(record);}return respond({closed:true});}
      if(suffix?.startsWith("sessions/")){
        const lease=sessions.get(input.sessionEpoch);if(!lease||lease.binding.clientInstanceId!==`client-${index}`||!door.open)return deny(403);
        if(suffix==="sessions/renew"){if(input.expectedLeaseRevision!==lease.leaseRevision)return deny(409);lease.leaseRevision=String(Number(lease.leaseRevision)+1);lease.expiresAt=now();}return respond(lease);}
      if(suffix==="conversations/propose"){
        const own=sessions.get(input.selfSessionEpoch);assert.equal(own.binding.clientInstanceId,`client-${index}`);
        const members=input.memberSessionEpochs.map(epoch=>({sessionEpoch:epoch,binding:sessions.get(epoch).binding,accepted:epoch===input.selfSessionEpoch}));
        assert(Array.isArray(input.expectedMembers),"New Web must always bind the selected client identities");
        for(const member of members)assert(input.expectedMembers.some(expected=>expected.sessionEpoch===member.sessionEpoch&&expected.clientInstanceId===member.binding.clientInstanceId));
        const record={kind:"acoustic-conversation-consent",conversationId:input.conversationId,revisionId:randomUUID(),world,zoneId:"private-zone",doorId:"review-door",doorEpoch:door.epoch,status:"pending",members,expiresAt:now(),reason:null,leaseRevision:"1"};conversations.set(record.conversationId,record);hint(record);return respond({conversation:record,replayed:false});}
      if(suffix?.startsWith("conversations/")){
        const record=conversations.get(input.conversationId),self=record?.members.find(member=>member.sessionEpoch===input.selfSessionEpoch);if(!self||self.binding.clientInstanceId!==`client-${index}`)return deny(403);
        if(suffix==="conversations/change"){
          if(input.expectedRevisionId!==record.revisionId)return deny(409);
          if(input.action==="accept"){self.accepted=true;if(record.members.every(member=>member.accepted))record.status="active";}
          else{record.status="revoked";record.reason=input.action==="block"?"blocked":"left";}
          record.revisionId=randomUUID();hint(record);if(lostAction){lostAction=false;return route.abort("failed");}
        }
        if(suffix==="conversations/renew"){if(input.expectedLeaseRevision!==record.leaseRevision)return deny(409);record.leaseRevision=String(Number(record.leaseRevision)+1);record.expiresAt=now();}
        return respond({conversation:record,replayed:false});
      }
      throw new Error(`Unexpected fixture request ${url.pathname}`);
    }catch(error){errors.push(error.message);await route.abort();}
  });
}
const [a,b]=pages;
const panel=page=>page.getByRole("region",{name:"비공개 대화방",exact:true});
const state=page=>page.locator("#fixture-state").evaluate(element=>JSON.parse(element.textContent));
async function waitFor(page,fn){await page.waitForFunction(fn,null,{timeout:20000});}
async function connect(){await Promise.all(pages.map((page,i)=>page.goto(`${origin.origin}/tools/browser-harnesses/virtual-studio-private-room.html?actor=${i?"b":"a"}`)));
  await Promise.all(pages.map(page=>page.waitForFunction(()=>Boolean(window.privateFixture))));
  const offer=await a.evaluate(()=>window.privateFixture.offer()),answer=await b.evaluate(value=>window.privateFixture.accept(value),offer);await a.evaluate(value=>window.privateFixture.answer(value),answer);
  await Promise.all(pages.map(page=>waitFor(page,()=>JSON.parse(document.querySelector("#fixture-state").textContent).ready)));}
async function invite(){await panel(a).getByLabel("팀원 B",{exact:true}).last().check();await panel(a).getByRole("button",{name:"선택한 팀원에게 대화 초대",exact:true}).click();
  await panel(b).getByRole("button",{name:"이 참여자들과 대화 수락",exact:true}).waitFor();assert.equal(await a.evaluate(()=>window.qaCaptureCalls),0);assert.equal(await b.evaluate(()=>window.qaCaptureCalls),0);
  await panel(b).getByRole("button",{name:"이 참여자들과 대화 수락",exact:true}).click();await Promise.all(pages.map(page=>waitFor(page,()=>JSON.parse(document.querySelector("#fixture-state").textContent).conversations.some(c=>c.status==="active"))));}
try{
  await connect();assert.equal(await a.evaluate(()=>window.qaCaptureCalls),0);assert.equal(await b.evaluate(()=>window.qaCaptureCalls),0);
  await panel(a).getByText("문과 입장 대상 설정",{exact:true}).click();await panel(a).getByLabel("관리자 A",{exact:true}).check();await panel(a).getByLabel("팀원 B",{exact:true}).check();await panel(a).getByRole("button",{name:"선택한 팀원에게 문 열기",exact:true}).click();
  await Promise.all(pages.map(page=>panel(page).getByRole("button",{name:"현재 상태 확인",exact:true}).click()));
  lostOpen=true;await panel(a).getByRole("button",{name:"이 구역에서 입장 확인",exact:true}).click();await panel(a).getByRole("button",{name:"현재 상태 확인",exact:true}).click();
  await panel(b).getByRole("button",{name:"이 구역에서 입장 확인",exact:true}).click();
  await waitFor(a,()=>JSON.parse(document.querySelector("#fixture-state").textContent).candidates.length===1);
  assert.equal(requests.filter(r=>r.actor==="actor-0"&&r.path.endsWith("/sessions/open")).length,1);results.push("lost open response reconciled by read only");
  lostAction=true;await invite();assert.equal(requests.filter(r=>r.actor==="actor-1"&&r.input?.action==="accept").length,1);results.push("symmetric self acceptance and ambiguous accept read only");
  await Promise.all(pages.map(page=>page.getByRole("button",{name:"동의하고 P2P 채팅 참여",exact:true}).click()));
  assert.equal(await a.evaluate(()=>window.qaCaptureCalls),0);assert.equal(await b.evaluate(()=>window.qaCaptureCalls),0);
  await a.getByRole("button",{name:"마이크 켜기",exact:true}).click();
  await a.waitForFunction(async()=>{for(const pc of window.qaPcs){for(const report of (await pc.getStats()).values())if(report.type==="outbound-rtp"&&report.kind==="audio"&&report.bytesSent>0)return true;}return false;},null,{timeout:20000});
  results.push("real two-context RTC generated audio only after explicit microphone click");
  await a.evaluate(()=>window.dispatchEvent(new Event("blur")));assert.equal(await a.evaluate(()=>window.qaStopped),0);results.push("ordinary blur preserves the call");
  await a.getByRole("button",{name:"대화 패널 접기",exact:true}).click();await a.getByRole("button",{name:"예시 구역 이탈",exact:true}).click();
  await a.waitForFunction(()=>window.qaStopped>0);await waitFor(a,()=>!JSON.parse(document.querySelector("#fixture-state").textContent).session);results.push("zone departure releases captured media");
  await b.setViewportSize({width:390,height:844});await b.screenshot({path:path.join(output,"private-room-mobile.png"),fullPage:true});
  assert(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await b.getByRole("button",{name:"예시 계정 전환",exact:true}).click();assert.equal((await state(b)).session,null);results.push("account change clears private data; mobile has no overflow");
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,"result.json"),JSON.stringify({passed:results.length,results,requests:requests.length,errors,
    scope:"Actual product panel/hook/Huddle and two Chromium RTC peers with generated audio. Synthetic HTTP/cookie/Core bindings. No actual API authentication, GPU or WAN claim."},null,2));
  console.log(JSON.stringify({passed:results.length,requests:requests.length,errors}));
}finally{await browser.close();}
