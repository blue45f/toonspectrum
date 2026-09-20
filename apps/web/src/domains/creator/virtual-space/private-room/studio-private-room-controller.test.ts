import { afterEach, describe, expect, it, vi } from "vitest";
import { type StudioAcousticSessionLease } from "@toonspectrum/studio-project-model/world-acoustic";
import { type StudioConversationSnapshot } from "@toonspectrum/studio-project-model/world-conversation";

import { fixture,ids,flush } from "./studio-private-room-controller.fixture";

afterEach(()=>vi.restoreAllMocks());
describe("server-authorized private-room controller",()=>{
  it.each([false,true])("rejects another admitted person's advertised epoch, including lost-response reconciliation=%s",async(lost)=>{
    const f=fixture(3);await f.start();
    f.spoofEpoch(1,ids[2]!);
    const propose=vi.mocked(f.apis[0]!.propose).getMockImplementation()!;
    if(lost)vi.mocked(f.apis[0]!.propose).mockImplementationOnce(async(...args)=>{await propose(...args);throw new Error("lost");});
    await f.controllers[0]!.propose(["client-1"]);if(lost)await f.controllers[0]!.refresh();
    expect(f.controllers[0]!.snapshot().session).toBeNull();expect(f.controllers[0]!.snapshot().conversations).toEqual([]);
    expect(vi.mocked(f.apis[0]!.propose).mock.calls[0]![0].expectedMembers).toEqual([{sessionEpoch:ids[0],clientInstanceId:"client-0"},{sessionEpoch:ids[2],clientInstanceId:"client-1"}]);
  });
  it("keeps admission separate from each participant's consent and produces the same exact roster",async()=>{
    const f=fixture(4);await f.start();expect(f.controllers.every(c=>c.snapshot().conversations.length===0)).toBe(true);
    await f.controllers[0]!.propose(["client-1","client-2","client-3"]);const id=f.controllers[0]!.snapshot().conversations[0]!.conversationId;
    expect(f.controllers[0]!.mediaValid(id)).toBe(false);
    for(const c of f.controllers.slice(1)){await c.refresh();expect(c.mediaValid(id)).toBe(false);await c.change(id,"accept");}
    for(const c of f.controllers){await c.refresh();expect(c.mediaValid(id)).toBe(true);expect(c.snapshot().conversations[0]!.members).toHaveLength(4);}
    expect(f.apis[0]!.change).not.toHaveBeenCalled();
  });
  it("reconciles a lost open response by reading its original input/key, never posting another open",async()=>{
    const f=fixture();vi.mocked(f.apis[0]!.open).mockRejectedValueOnce(new Error("response lost"));
    f.controllers[0]!.start();await flush();await f.controllers[0]!.enter();expect(f.controllers[0]!.snapshot().uncertain).toBe(true);
    await f.controllers[0]!.refresh();expect(f.apis[0]!.open).toHaveBeenCalledTimes(1);
    expect(vi.mocked(f.apis[0]!.readOpen).mock.calls[0]!.slice(0,2)).toEqual(vi.mocked(f.apis[0]!.open).mock.calls[0]!.slice(0,2));
    expect(f.controllers[0]!.snapshot().session).not.toBeNull();
  });
  it("allows only an explicit identical retry when read-open-intent has no result",async()=>{
    const f=fixture(),c=f.controllers[0]!;vi.mocked(f.apis[0]!.open).mockRejectedValueOnce(new Error("not delivered"));vi.mocked(f.apis[0]!.readOpen).mockResolvedValue(null);
    c.start();await flush();await c.enter();await c.refresh();expect(c.snapshot().entryPending).toBe(true);expect(f.apis[0]!.open).toHaveBeenCalledOnce();
    f.advance(3500);c.tick();await flush();expect(f.apis[0]!.open).toHaveBeenCalledOnce();
    await c.retryEntry();const calls=vi.mocked(f.apis[0]!.open).mock.calls;expect(calls[1]!.slice(0,2)).toEqual(calls[0]!.slice(0,2));expect(c.snapshot().session).not.toBeNull();
  });
  it("fences a pending admission on same-actor session publication and reads the original intent instead",async()=>{
    const f=fixture(),c=f.controllers[0]!;let finish!:(value:StudioAcousticSessionLease)=>void;
    vi.mocked(f.apis[0]!.open).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));vi.mocked(f.apis[0]!.readOpen).mockResolvedValue(null);
    c.start();await flush();const pending=c.enter();await flush();const revision=c.captureRevision();await c.authRefresh();finish(f.leases[0]!);await pending;
    expect(c.captureRevision()).toBe(revision+1);expect(c.snapshot().session).toBeNull();expect(f.apis[0]!.readOpen).toHaveBeenCalledOnce();expect(f.apis[0]!.open).toHaveBeenCalledOnce();
  });
  it("does not automatically resend the same failed heartbeat CAS after an unchanged read",async()=>{
    const f=fixture();await f.active();vi.mocked(f.apis[0]!.renewSession).mockRejectedValueOnce(new Error("not delivered"));f.advance(7600);
    f.controllers[0]!.tick();await flush();await f.controllers[0]!.refresh();f.controllers[0]!.tick();await flush();expect(f.apis[0]!.renewSession).toHaveBeenCalledOnce();
  });
  it("keeps a lost accept uncertain and performs only a read until the server response is known",async()=>{
    const f=fixture();await f.start();await f.controllers[0]!.propose(["client-1"]);const id=f.controllers[0]!.snapshot().conversations[0]!.conversationId;await f.controllers[1]!.refresh();
    const original=vi.mocked(f.apis[1]!.change).getMockImplementation()!;vi.mocked(f.apis[1]!.change).mockImplementationOnce(async input=>{await original(input,"key",new AbortController().signal);throw new Error("lost");});
    await f.controllers[1]!.change(id,"accept");expect(f.controllers[1]!.mediaValid(id)).toBe(false);await f.controllers[1]!.refresh();
    expect(f.apis[1]!.change).toHaveBeenCalledTimes(1);expect(f.controllers[1]!.mediaValid(id)).toBe(true);
  });
  it("invalidates media before waiting for a hint read; a hint for another epoch has no effect",async()=>{
    const f=fixture(),id=await f.active(),c=f.controllers[0]!;
    c.hint({version:1,workId:"work",conversationId:id,selfSessionEpoch:ids[1]});expect(c.mediaValid(id)).toBe(true);
    vi.mocked(f.apis[0]!.read).mockImplementationOnce(()=>new Promise(()=>{}));
    c.hint({version:1,workId:"work",conversationId:id,selfSessionEpoch:ids[0]});expect(c.mediaValid(id)).toBe(false);
  });
  it("hard-ends a crossed boundary and does not revive the old session after returning",async()=>{
    const f=fixture(),id=await f.active(),c=f.controllers[0]!;f.setEligible(false);c.tick();
    expect(c.mediaValid(id)).toBe(false);expect(c.snapshot().session).toBeNull();expect(f.apis[0]!.closeSession).toHaveBeenCalledTimes(1);
    f.setEligible(true);await c.refresh();expect(c.snapshot().session).toBeNull();expect(c.mediaValid(id)).toBe(false);
  });
  it("keeps boundary withdrawal sticky while a prior hint read is still pending",async()=>{
    const f=fixture(),id=await f.active(),c=f.controllers[0]!;let finish!:(value:StudioConversationSnapshot)=>void;
    vi.mocked(f.apis[0]!.read).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    c.hint({version:1,workId:"work",conversationId:id,selfSessionEpoch:ids[0]});await flush();
    f.setEligible(false);c.tick();f.setEligible(true);finish(f.records.get(id)!);await flush();
    expect(c.mediaValid(id)).toBe(false);expect(c.snapshot().session).toBeNull();expect(f.apis[0]!.closeSession).toHaveBeenCalledOnce();
  });
  it.each(["leave","decline","cancel","block"] as const)("keeps local %s withdrawal despite an uncertain POST followed by an active read",async(action)=>{
    const f=fixture(),id=await f.active(),c=f.controllers[0]!;
    vi.mocked(f.apis[0]!.change).mockRejectedValueOnce(new Error("lost"));
    await c.change(id,action,action==="block"?ids[1]:undefined);expect(c.mediaValid(id)).toBe(false);
    await c.refresh();expect(c.mediaValid(id)).toBe(false);expect(f.apis[0]!.change).toHaveBeenCalledOnce();
  });
  it("honors manual leave while an earlier read is pending and fences its later active response",async()=>{
    const f=fixture(),id=await f.active(),c=f.controllers[0]!;let finish!:(value:StudioAcousticSessionLease)=>void;
    vi.mocked(f.apis[0]!.readSession).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const reading=c.refresh();await flush();
    await c.change(id,"leave");expect(c.mediaValid(id)).toBe(false);expect(f.apis[0]!.change).toHaveBeenCalledOnce();
    finish(f.leases[0]!);await reading;expect(c.mediaValid(id)).toBe(false);expect(c.snapshot().conversations[0]!.status).toBe("revoked");
  });
  it("expires despite a blocked request and immediately rejects a late response",async()=>{
    const f=fixture(),id=await f.active(),c=f.controllers[0]!;let finish!:(value:StudioAcousticSessionLease)=>void;
    vi.mocked(f.apis[0]!.readSession).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const pending=c.refresh();await flush();
    f.advance(16000);c.tick();expect(c.mediaValid(id)).toBe(false);finish(f.leases[0]!);await pending;expect(c.snapshot().session).toBeNull();
  });
  it("never applies A's delayed private data after account/context replacement",async()=>{
    const f=fixture();let finish!:(value:StudioAcousticSessionLease)=>void;vi.mocked(f.apis[0]!.open).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const c=f.controllers[0]!;c.start();await flush();const pending=c.enter();await flush();f.setCurrent(false);c.invalidate();finish(f.leases[0]!);await pending;
    expect(c.snapshot().session).toBeNull();expect(c.snapshot().team).toBeNull();expect(f.apis[0]!.closeSession).not.toHaveBeenCalled();
  });
  it("renews only its own session and then the observed ephemeral conversation CAS",async()=>{
    const f=fixture(),id=await f.active();f.advance(7600);f.controllers[0]!.tick();await flush();
    expect(f.apis[0]!.renewSession).toHaveBeenCalledWith({sessionEpoch:ids[0],expectedLeaseRevision:"1"},expect.any(AbortSignal));
    expect(f.apis[1]!.renewSession).not.toHaveBeenCalled();expect(f.apis[0]!.renew).toHaveBeenCalledWith({conversationId:id,selfSessionEpoch:ids[0],expectedRevisionId:"consent-2",expectedLeaseRevision:"1"},expect.any(AbortSignal));
  });
  it("does not revive a terminal conversation from a stale successful read",async()=>{
    const f=fixture(),id=await f.active(),c=f.controllers[0]!,old=structuredClone(f.records.get(id)!);await c.change(id,"leave");
    f.records.set(id,old);await c.refresh();expect(c.mediaValid(id)).toBe(false);expect(c.snapshot().conversations[0]!.status).toBe("revoked");
  });
  it("clears the old private roster and read queue when the same actor loses authority",async()=>{
    const f=fixture(),id=await f.active(),c=f.controllers[0]!;
    vi.mocked(f.apis[0]!.team).mockResolvedValueOnce({workId:"different",viewer:{userId:"actor-0",role:"owner",status:"active",capabilities:{view:true,edit:true,comment:true,manageMembers:true,respondInvite:false}},members:[]});
    await c.refresh();expect(c.snapshot().session).toBeNull();expect(c.snapshot().conversations).toEqual([]);expect(c.mediaValid(id)).toBe(false);
    vi.mocked(f.apis[0]!.read).mockClear();await c.refresh();await c.enter();await c.refresh();
    expect(f.apis[0]!.read).not.toHaveBeenCalled();expect(c.snapshot().conversations).toEqual([]);
  });
});
