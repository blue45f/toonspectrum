import { useEffect, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpacePeer } from "../studio-virtual-space-model";
import type { StudioWorldAcousticZoneDefinition } from "../studio-virtual-space-acoustics";
import type { useStudioPrivateRoom } from "./use-studio-private-room";

export function StudioPrivateRoomPanel({room,zones,zoneId,onZone,peers,labels,onWalk}:{room:ReturnType<typeof useStudioPrivateRoom>;
  zones:readonly StudioWorldAcousticZoneDefinition[];zoneId:string|null;onZone:(id:string)=>void;peers:readonly StudioVirtualSpacePeer[];labels?:Readonly<Record<string,string>>;onWalk?:()=>boolean}){
  const bt=useBilingual("domains.creator.virtual-space.private-room");
  const {snapshot:s,controller}=room;
  const [selected,setSelected]=useState<string[]>([]),[allowed,setAllowed]=useState<string[]>([]);
  const [walkFailed,setWalkFailed]=useState(false);
  useEffect(()=>{setWalkFailed(false);},[zoneId,room.entryReason]);
  useEffect(()=>{setSelected([]);},[s.session?.sessionEpoch,zoneId]);
  const allowedKey=JSON.stringify(s.door?.allowedUserIds??[]);
  useEffect(()=>{setAllowed(JSON.parse(allowedKey) as string[]);},[s.door?.epoch,allowedKey]);
  const candidateKey=JSON.stringify(s.candidates.map(candidate=>candidate.peerId));
  useEffect(()=>{const present=new Set<string>(JSON.parse(candidateKey));setSelected(ids=>ids.filter(id=>present.has(id)));},[candidateKey]);
  const name=(id:string)=>peers.find(peer=>peer.participant.sessionId===id)?.participant.displayName??bt("팀원","Teammate");
  const teamName=(id:string)=>s.team?.members.find(member=>member.userId===id)?.name??bt("팀원","Teammate");
  const own=s.session?.sessionEpoch;
  const errors:Record<string,string>={access:bt("현재 이 방에 접근할 권한을 확인할 수 없어요.","Your room access could not be verified."),
    unavailable:bt("서버 응답을 확인하지 못했어요. 확인 버튼은 결과만 다시 읽습니다.","The server response is uncertain. Check again only reads the result."),
    conflict:bt("방 상태가 바뀌었어요. 현재 상태를 다시 확인해 주세요.","Room state changed. Check the current state."),
    invalid:bt("방 권한 응답을 검증하지 못했어요.","The room authority response could not be verified."),
    expired:bt("방 권한이 만료되어 대화와 장치 연결을 종료했어요.","Room authority expired. Conversation and devices were disconnected."),
    boundary:bt("참여자가 허용된 대화 구역을 벗어나 연결을 종료했어요.","A participant left the permitted area. The conversation ended."),
    context:bt("계정·월드·연결이 바뀌어 권한을 다시 확인해야 해요.","Account, world or connection changed. Verify access again."),
    left:bt("비공개 방에서 나왔어요.","You left the private room."),"door-changed":bt("문 설정을 저장했어요. 다시 입장하려면 현재 권한을 확인해 주세요.","Door settings saved. Verify current access before entering again.")};
  if(!zones.length)return null;
  return <section className="vs2-panel space-y-3" aria-label={bt("비공개 대화방","Private conversation room")} data-space-interactive="true">
    <h2>{bt("비공개 대화방","Private conversation room")}</h2>
    <label className="block text-sm">{bt("대화 구역","Conversation area")}<select className="block min-h-11 w-full" value={zoneId??""} onChange={e=>onZone(e.target.value)}>{zones.map((zone,index)=><option key={zone.id} value={zone.id}>{labels?.[zone.id]??`${bt("비공개 방","Private room")} ${index+1}`}</option>)}</select></label>
    <p className="text-xs">{bt("게시된 방과 현재 서버 연결을 확인합니다. 각자 수락한 2–4명만 대화하며, 마이크·카메라는 직접 켜야 합니다.","The published room and your server connection are verified. Two to four people must each accept. You turn on your own mic and camera.")}</p>
    {!room.available?<p role="status">{bt("아직 입장할 수 없어요. 팀 공간에 연결한 뒤 게시된 방을 확인해 주세요.","Entry is not available yet. Connect to your team space and check the published room.")}</p>:null}
    {s.reason?<p role="status">{errors[s.reason]??bt("현재 방 권한을 확인해 주세요.","Verify current room authority.")}</p>:null}
    {room.entryReason==="outside"?<div><p>{bt("아바타가 이 방에 도착한 뒤 입장을 확인할 수 있어요.","Your avatar must arrive in this room before entering.")}</p>
      {onWalk?<button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm" type="button" onClick={()=>setWalkFailed(!onWalk())}>{bt("이 방으로 걸어가기","Walk to this room")}</button>:null}</div>:null}
    {room.entryReason==="read-only"?<p role="status">{bt("현재 보기 전용 권한으로는 대화에 참여할 수 없어요. 공간 관리자에게 팀 권한을 확인해 주세요.","Your current view-only role cannot join conversations. Ask the space manager to check your team role.")}</p>:null}
    {room.entryReason==="focused"?<p role="status">{bt("집중·자리 비움 상태를 해제한 뒤 입장할 수 있어요.","Leave focus or away mode before entering.")}</p>:null}
    {walkFailed?<p role="status">{bt("이 방으로 가는 길을 찾지 못했어요. 공간 배치를 확인해 주세요.","No route to this room was found. Check the room layout.")}</p>:null}
    {room.available?<button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" disabled={s.busy} onClick={()=>void controller?.refresh()}>{bt("현재 상태 확인","Check current state")}</button>:null}
    {s.entryPending?<div><p>{bt("입장 요청 결과를 아직 확인하지 못했어요. 다시 보내기를 직접 선택하면 같은 요청 번호로 재확인합니다.","The entry result is still unknown. An explicit retry uses the same request identity.")}</p>
      <button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" disabled={s.busy||!s.door?.permitted} onClick={()=>void controller?.retryEntry()}>{bt("같은 입장 요청 다시 보내기","Retry the same entry request")}</button></div>:null}
    {s.door?<p>{s.door.open?bt("문 열림","Door open"):bt("문 닫힘","Door closed")}{!s.door.permitted?` · ${bt("입장 허가 없음","Entry not permitted")}`:""}</p>:null}
    {!own&&s.door&&(!s.door.open||!s.door.permitted)?<div className="rounded-lg border border-line p-3">
      <p className="text-sm">{bt("문 앞에서 노크하면 공간 관리자에게 입장 요청만 전달됩니다. 수락하면 현재 문 허용 목록에 추가되며 관리자가 문 정책을 바꿀 때까지 유지됩니다. 노크만으로 문서·대화·마이크 권한은 생기지 않아요.","Knocking sends an admission request to space managers. Acceptance adds you to the current door allowlist until a manager changes the door policy. A knock never grants document, conversation, microphone or camera access.")}</p>
      <button className="mt-2 min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" disabled={s.busy||s.knockPending||!controller?.canKnock()} onClick={()=>controller?.knock()}>{s.knockPending?bt("응답을 기다리는 중…","Waiting for a response…"):bt("문 두드리기","Knock on the door")}</button>
      {s.knockOutcome?<p role="status" className="mt-2 text-sm">{s.knockOutcome.decision==="accepted"?bt("입장 요청을 수락했어요. 현재 문 상태를 확인한 뒤 직접 입장하세요.","Your request was accepted. Check the current door state, then enter explicitly."):bt("지금은 입장하기 어려워요. 관리자에게 메시지를 남기거나 나중에 다시 시도하세요.","Entry was declined for now. Leave a message or try again later.")}</p>:null}
    </div>:null}
    {s.team?.viewer.capabilities.manageMembers&&s.knocks.length?<section className="rounded-lg border border-line p-3" aria-label={bt("문 앞 입장 요청","Door knock requests")}>
      <h3 className="font-semibold">{bt("문 앞 입장 요청","Door knock requests")}</h3>
      {s.knocks.map(knock=><div className="mt-2 flex flex-wrap items-center gap-2" key={knock.requestId}><span className="mr-auto text-sm">{teamName(knock.actorId)}</span>
        <button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" disabled={s.busy} onClick={()=>void controller?.respondKnock(knock.requestId,"accepted")}>{bt("이 팀원에게 문 열기","Open for this teammate")}</button>
        <button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" disabled={s.busy} onClick={()=>void controller?.respondKnock(knock.requestId,"declined")}>{bt("지금은 어려워요","Not now")}</button></div>)}
    </section>:null}
    {s.team?.viewer.capabilities.manageMembers?<details><summary>{bt("문과 입장 대상 설정","Manage door and entry")}</summary>
      <fieldset className="space-y-2" disabled={s.busy}><legend>{bt("입장할 수 있는 팀원","Allowed teammates")}</legend>
        {s.team.members.filter(member=>member.status==="active").map(member=><label className="flex min-h-11 items-center gap-2" key={member.userId}><input className="size-4" type="checkbox" checked={allowed.includes(member.userId)} onChange={e=>setAllowed(ids=>e.target.checked?[...ids,member.userId]:ids.filter(id=>id!==member.userId))}/>{member.name}</label>)}
        <button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" onClick={()=>void controller?.changeDoor(true,allowed)}>{bt("선택한 팀원에게 문 열기","Open for selected teammates")}</button>
        <button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" onClick={()=>void controller?.changeDoor(false,allowed)}>{bt("문 닫고 대화 종료","Close door and end conversations")}</button>
      </fieldset></details>:null}
    {!own?<button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" disabled={s.busy||!s.door?.open||!s.door.permitted||s.uncertain||Boolean(room.entryReason)} onClick={()=>void controller?.enter()}>{bt("이 구역에서 입장 확인","Enter from this area")}</button>
      :<><p>{bt("입장 확인됨 · 대화 참여는 별도 수락이 필요해요.","Entry verified. Conversation requires separate acceptance.")}</p>
        <fieldset className="space-y-2" disabled={s.busy||s.uncertain}><legend>{bt("근처 입장한 팀원 초대","Invite nearby admitted teammates")}</legend>
          {s.candidates.map(candidate=><label className="flex min-h-11 items-center gap-2" key={candidate.peerId}><input className="size-4" type="checkbox" checked={selected.includes(candidate.peerId)} disabled={!selected.includes(candidate.peerId)&&selected.length>=3} onChange={e=>setSelected(ids=>e.target.checked?[...ids,candidate.peerId]:ids.filter(id=>id!==candidate.peerId))}/>{name(candidate.peerId)}</label>)}
          {!s.candidates.length?<p>{bt("같은 구역에서 입장을 확인한 팀원을 기다리고 있어요.","Waiting for a teammate to enter the same area.")}</p>:null}
          <button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" disabled={!selected.length} onClick={()=>void controller?.propose(selected)}>{bt("선택한 팀원에게 대화 초대","Invite selected teammates")}</button>
        </fieldset><button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" onClick={()=>controller?.leave()}>{bt("방에서 나가기","Leave room")}</button></>}
    {s.conversations.map(record=><div key={record.conversationId} className="rounded border border-line p-2">
      <p>{record.members.map(member=>member.sessionEpoch===own?bt("나","You"):name(member.binding.clientInstanceId)).join(" · ")}</p>
      <p>{record.status==="active"?(controller?.mediaValid(record.conversationId)?bt("모두 수락하여 대화가 준비됐어요.","Everyone accepted. Conversation is ready."):bt("현재 참여자들의 대화 권한과 위치를 다시 확인하고 있어요.","Checking the current participants’ conversation permission and location.")):record.status==="revoked"?bt("종료된 대화","Ended conversation"):bt("각 참여자의 수락을 기다려요.","Waiting for each participant to accept.")}</p>
      {record.status==="pending"&&!record.members.find(member=>member.sessionEpoch===own)?.accepted?<><button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" disabled={s.busy||s.uncertain} onClick={()=>void controller?.change(record.conversationId,"accept")}>{bt("이 참여자들과 대화 수락","Accept this conversation")}</button><button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" onClick={()=>void controller?.change(record.conversationId,"decline")}>{bt("거절","Decline")}</button></>:null}
      {record.status!=="revoked"?<><button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" onClick={()=>void controller?.change(record.conversationId,record.status==="pending"?"cancel":"leave")}>{bt("대화 나가기","Leave conversation")}</button>
        {record.members.filter(member=>member.sessionEpoch!==own).map(member=><button className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" type="button" key={member.sessionEpoch} onClick={()=>void controller?.change(record.conversationId,"block",member.sessionEpoch)}>{name(member.binding.clientInstanceId)} {bt("이번 방문에서 차단","Block for this visit")}</button>)}</>:null}
    </div>)}
  </section>;
}
