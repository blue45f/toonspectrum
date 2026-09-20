import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { studioWorldPublishSchema, type StudioWorldPublish } from "@toonspectrum/studio-project-model";
import type * as DatabaseRuntime from "../../db";
import type { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import type { StudioWorldPublicationRepository } from "./studio-world-publication.repository";
import type { StudioWorldAcousticRepository } from "./studio-world-acoustic.repository";
import type { StudioWorldAcousticService } from "./studio-world-acoustic.service";
import type { StudioLiveAcousticBinding } from "../creator/studio-live-acoustic-binding";
import type { DrizzleStudioLiveLockRepository } from "../creator/studio-live-lock.repository";
import { CommitStudioRevisionSchema, CreateStudioProjectGraphSchema, RestoreStudioRevisionSchema } from "./studio-project-graph.dto";

const connection = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !connection) throw new Error("CI must provide PostgreSQL for world publication authority");
const input = (expectedPublishedRevisionId: string | null = null, label = "Room"): StudioWorldPublish => studioWorldPublishSchema.parse({ expectedPublishedRevisionId,
  manifest: { id: "studio", version: 1, width: 100, height: 100, backgroundAssetKey: "background", backgroundUrl: "/assets/background.png",
    rooms: [{ id: "room", x: 0, y: 0, width: 100, height: 100, labelKo: "방", labelEn: label }], props: [], colliders: [], interactions: [], portals: [],
    spawns: [{ id: "spawn", point: { x: 20, y: 20 } }], npcs: [], acousticZones: [{ id: "zone", roomId: "room", x: 0, y: 0, width: 100, height: 100, policy: "private", doorId: "door" }] } });

(connection ? describe : describe.skip)("authoritative world publication on real PostgreSQL", () => {
  let pool: Pool, database: typeof DatabaseRuntime, repository: StudioWorldPublicationRepository, graph: StudioProjectGraphRepository;
  let acoustic: StudioWorldAcousticRepository, genericLocks: DrizzleStudioLiveLockRepository;
  let acousticService: new (repository: StudioWorldAcousticRepository, binding: StudioLiveAcousticBinding) => StudioWorldAcousticService;
  const works: string[] = [], users: string[] = [];
  const previousDatabase = process.env.DATABASE_URL;
  beforeAll(async () => {
    process.env.DATABASE_URL = connection!;
    pool = new Pool({ connectionString: connection, max: 4 });
    database = await import("../../db");
    repository = new (await import("./studio-world-publication.repository")).StudioWorldPublicationRepository();
    graph = new (await import("./studio-project-graph.repository")).StudioProjectGraphRepository();
    acoustic = new (await import("./studio-world-acoustic.repository")).StudioWorldAcousticRepository();
    genericLocks = new (await import("../creator/studio-live-lock.repository")).DrizzleStudioLiveLockRepository();
    acousticService = (await import("./studio-world-acoustic.service")).StudioWorldAcousticService;
    const triggers = await pool.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal");
    expect(triggers.rows.map((row) => row.tgname)).toEqual(expect.arrayContaining(["studio_revision_immutable_update", "studio_operation_immutable_update", "studio_revision_topology_parent"]));
  });
  afterEach(async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const revisions = 'SELECT revision.id FROM studio_revision revision JOIN studio_artifact artifact ON artifact.id=revision."artifactId" JOIN studio_project_graph project ON project.id=artifact."projectId" WHERE project."workId"=ANY($1::text[])';
      for (const table of ["studio_revision_parent", "studio_operation", "studio_mutation_receipt"]) {
        const field = table === "studio_revision_parent" ? "revisionId" : "resultRevisionId";
        await client.query(`DELETE FROM ${table} WHERE "${field}" IN (${revisions})`, [works]);
      }
      await client.query('DELETE FROM creator_work WHERE id=ANY($1::text[])', [works]);
      await client.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users]);
      await client.query("COMMIT"); works.length = 0; users.length = 0;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
  afterAll(async () => { await Promise.all([pool?.end(), database?.dbPool.end()]);
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase; });
  async function user() { const id = randomUUID(); users.push(id); await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [id, "World test actor"]); return id; }
  async function fixture() { const actor = await user(), workId = randomUUID(); works.push(workId);
    await pool.query('INSERT INTO creator_work (id,"userId",title) VALUES ($1,$2,$3)', [workId, actor, "World authority fixture"]); return { actor, workId }; }
  async function member(workId: string, role: "admin" | "editor" | "commenter" | "viewer", status = "active") {
    const actor = await user();
    await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,$3,$4,$5,CASE WHEN $4='pending' THEN NULL ELSE now() END)`, [workId, actor, role, status, randomUUID()]); return actor;
  }
  async function acousticFixture() {
    const f=await fixture(), principal={userId:f.actor,sessionVersion:1,expiresAt:Date.now()+600000};
    const publication=(await repository.publish(f.actor,f.workId,input(),randomUUID())).publication;
    const world={worldId:publication.manifest.id,revisionId:publication.revisionId,contentHash:publication.contentHash};
    const doorInput={world,zoneId:"zone",expectedDoorEpoch:null,open:true,allowedUserIds:[f.actor]};
    const {door}=await acoustic.changeDoor(principal,f.workId,doorInput,randomUUID());
    const binding={connectionId:randomUUID(),clientInstanceId:randomUUID(),joinedAt:new Date().toISOString()};
    const sessionInput={world,zoneId:"zone",doorEpoch:door.epoch,connectionId:binding.connectionId,clientInstanceId:binding.clientInstanceId,expectedSessionEpoch:null};
    return {...f,principal,publication,world,doorInput,door,binding,sessionInput};
  }
  it("keeps manager door publication separate from a participant session lease and exposes no media grant",async()=>{
    const f=await acousticFixture();
    expect(await acoustic.door(f.principal,f.workId,"zone")).toMatchObject({epoch:f.door.epoch,permitted:true,open:true});
    const session=await acoustic.open(f.principal,f.workId,f.sessionInput,f.binding,randomUUID());
    expect(session.kind).toBe("acoustic-session-lease-only"); expect(session).not.toHaveProperty("conversationId");
    const remaining=await pool.query<{ms:string}>('SELECT EXTRACT(EPOCH FROM ("expiresAt"-statement_timestamp()))*1000 AS ms FROM creator_work_live_lock WHERE "workId"=$1',[f.workId]);
    expect(Number(remaining.rows[0]!.ms)).toBeLessThanOrEqual(15000);
    expect(await acoustic.current(f.principal,f.workId,session.sessionEpoch)).toEqual(session);
    expect(await repository.current(f.actor,f.workId)).toEqual(f.publication);
  });
  it("requires manager permission for door changes, fresh active membership for allowlists, and separate explicit inclusion",async()=>{
    const f=await acousticFixture(), editor=await member(f.workId,"editor"), outsider=await user();
    const principal={...f.principal,userId:editor};
    expect(await acoustic.door(principal,f.workId,"zone")).toMatchObject({permitted:false});
    expect(await acoustic.door(principal,f.workId,"zone")).not.toHaveProperty("allowedUserIds");
    await expect(acoustic.changeDoor(principal,f.workId,{...f.doorInput,expectedDoorEpoch:f.door.epoch},randomUUID())).rejects.toMatchObject({operation:"manage"});
    await expect(acoustic.changeDoor(f.principal,f.workId,{...f.doorInput,expectedDoorEpoch:f.door.epoch,allowedUserIds:[outsider]},randomUUID())).rejects.toMatchObject({operation:"manage"});
    await expect(acoustic.open(principal,f.workId,f.sessionInput,f.binding,randomUUID())).rejects.toMatchObject({reason:"closed"});
  });
  it("door CAS serializes competitors; replay does not reopen a newer closed door",async()=>{
    const f=await acousticFixture(), key=randomUUID(), change={...f.doorInput,expectedDoorEpoch:f.door.epoch};
    const results=await Promise.allSettled([acoustic.changeDoor(f.principal,f.workId,change,key),acoustic.changeDoor(f.principal,f.workId,{...change,open:false},randomUUID())]);
    expect(results.filter((v)=>v.status==="fulfilled")).toHaveLength(1);
    const current=await acoustic.door(f.principal,f.workId,"zone");
    const closed=await acoustic.changeDoor(f.principal,f.workId,{...change,expectedDoorEpoch:current.epoch,open:false},randomUUID());
    if (results[0]!.status==="fulfilled") expect((await acoustic.changeDoor(f.principal,f.workId,change,key)).replayed).toBe(true);
    expect(await acoustic.door(f.principal,f.workId,"zone")).toMatchObject({epoch:closed.door.epoch,open:false});
  });
  it("same session intent replays without extension and changed input cannot reuse its key",async()=>{
    const f=await acousticFixture(), key=randomUUID(), first=await acoustic.open(f.principal,f.workId,f.sessionInput,f.binding,key);
    expect(await acoustic.open(f.principal,f.workId,f.sessionInput,f.binding,key)).toEqual(first);
    await expect(acoustic.open(f.principal,f.workId,{...f.sessionInput,expectedSessionEpoch:randomUUID()},f.binding,key)).rejects.toMatchObject({message:"studio_idempotency_conflict"});
    const renewed=await acoustic.current(f.principal,f.workId,first.sessionEpoch,first.leaseRevision);
    expect(BigInt(renewed.leaseRevision)).toBeGreaterThan(BigInt(first.leaseRevision));
    await expect(acoustic.current(f.principal,f.workId,first.sessionEpoch,first.leaseRevision)).rejects.toMatchObject({reason:"stale"});
  });
  it("door close removes its session rows atomically and late renewal/old-open replay cannot revive them",async()=>{
    const f=await acousticFixture(), key=randomUUID(), session=await acoustic.open(f.principal,f.workId,f.sessionInput,f.binding,key);
    await acoustic.changeDoor(f.principal,f.workId,{...f.doorInput,expectedDoorEpoch:f.door.epoch,open:false},randomUUID());
    expect((await pool.query('SELECT 1 FROM creator_work_live_lock WHERE "workId"=$1',[f.workId])).rowCount).toBe(0);
    await expect(acoustic.current(f.principal,f.workId,session.sessionEpoch,session.leaseRevision)).rejects.toMatchObject({reason:"stale"});
    await expect(acoustic.open(f.principal,f.workId,f.sessionInput,f.binding,key)).rejects.toMatchObject({reason:"closed"});
  });
  it("world republish and account-session revocation invalidate old leases",async()=>{
    const f=await acousticFixture(), session=await acoustic.open(f.principal,f.workId,f.sessionInput,f.binding,randomUUID());
    await repository.publish(f.actor,f.workId,input(f.publication.revisionId),randomUUID());
    await expect(acoustic.current(f.principal,f.workId,session.sessionEpoch)).rejects.toMatchObject({reason:"stale"});
    await pool.query('UPDATE "user" SET "sessionVersion"=2 WHERE id=$1',[f.actor]);
    await expect(acoustic.current(f.principal,f.workId,session.sessionEpoch)).rejects.toMatchObject({reason:"session"});
  });
  it("expiry and reconnect replacement fence delayed renew/revoke while preserving the newer epoch",async()=>{
    const f=await acousticFixture(), key=randomUUID(), old=await acoustic.open(f.principal,f.workId,f.sessionInput,f.binding,key);
    await pool.query(`UPDATE creator_work_live_lock SET "createdAt"=now()-interval '1 minute',"expiresAt"=now()-interval '1 second' WHERE "workId"=$1`,[f.workId]);
    await expect(acoustic.current(f.principal,f.workId,old.sessionEpoch,old.leaseRevision)).rejects.toMatchObject({reason:"stale"});
    await expect(acoustic.open(f.principal,f.workId,f.sessionInput,f.binding,key)).rejects.toMatchObject({reason:"stale"});
    const binding={...f.binding,connectionId:randomUUID(),joinedAt:new Date().toISOString()};
    const next=await acoustic.open(f.principal,f.workId,{...f.sessionInput,connectionId:binding.connectionId},binding,randomUUID());
    await acoustic.revoke(f.actor,f.workId,old.sessionEpoch);
    expect(await acoustic.current(f.principal,f.workId,next.sessionEpoch)).toEqual(next);
  });
  it("generic seat APIs neither issue/release nor expose reserved sessions; actual disconnect cleanup still removes them",async()=>{
    const f=await acousticFixture(), session=await acoustic.open(f.principal,f.workId,f.sessionInput,f.binding,randomUUID());
    const row=(await pool.query<{resourceId:string;acquisitionId:string}>('SELECT "resourceId","acquisitionId" FROM creator_work_live_lock WHERE "workId"=$1',[f.workId])).rows[0]!;
    expect((await genericLocks.snapshot(f.workId)).locks).toEqual([]);
    await expect(genericLocks.acquire({workId:f.workId,resourceId:row.resourceId,ownerConnectionId:f.binding.connectionId,ownerName:"fake",leaseMs:15000,requestedLeaseId:randomUUID(),acquisitionId:randomUUID()})).rejects.toThrow("server-reserved");
    await expect(genericLocks.release({workId:f.workId,resourceId:row.resourceId,ownerConnectionId:f.binding.connectionId,leaseId:session.sessionEpoch})).rejects.toThrow("server-reserved");
    expect(await genericLocks.releaseConnection(f.workId,f.binding.connectionId)).toEqual([]);
    await expect(acoustic.current(f.principal,f.workId,session.sessionEpoch)).rejects.toMatchObject({reason:"stale"});
  });
  it("binding loss after DB commit revokes the exact issued epoch without automatic mutation retry",async()=>{
    const f=await acousticFixture();let checks=0;
    const service=new acousticService(acoustic,{verify:async()=>++checks===1?f.binding:null} as unknown as StudioLiveAcousticBinding);
    await expect(service.open(f.principal,f.workId,f.sessionInput,randomUUID())).rejects.toMatchObject({status:503});
    expect(checks).toBe(2);expect((await pool.query('SELECT 1 FROM creator_work_live_lock WHERE "workId"=$1',[f.workId])).rowCount).toBe(0);
  });
  it("door close during the post-commit Core binding check cannot return a live lease",async()=>{
    const f=await acousticFixture();let checks=0;
    const service=new acousticService(acoustic,{verify:async()=>{if(++checks===2) await acoustic.changeDoor(f.principal,f.workId,{...f.doorInput,expectedDoorEpoch:f.door.epoch,open:false},randomUUID());return f.binding;}} as unknown as StudioLiveAcousticBinding);
    await expect(service.open(f.principal,f.workId,f.sessionInput,randomUUID())).rejects.toMatchObject({status:409});
    expect(checks).toBe(2);
  });
  it("enforces the 24-session bound independently of generic seat locks",async()=>{
    const f=await acousticFixture();
    for(let index=0;index<24;index++) {
      const binding={...f.binding,connectionId:randomUUID(),clientInstanceId:randomUUID()};
      await acoustic.open(f.principal,f.workId,{...f.sessionInput,connectionId:binding.connectionId,clientInstanceId:binding.clientInstanceId},binding,randomUUID());
    }
    await expect(acoustic.open(f.principal,f.workId,f.sessionInput,f.binding,randomUUID())).rejects.toMatchObject({reason:"limit"});
    expect((await pool.query('SELECT count(*)::int AS count FROM creator_work_live_lock WHERE "workId"=$1',[f.workId])).rows[0].count).toBe(24);
    expect((await genericLocks.acquire({workId:f.workId,resourceId:"seat:public",requestedLeaseId:randomUUID(),acquisitionId:randomUUID(),ownerConnectionId:"public",ownerName:"Public",leaseMs:15000})).status).toBe("acquired");
    expect((await genericLocks.snapshot(f.workId)).locks).toHaveLength(1);
  });
  it.each(["door","session"] as const)("missing %s receipt cannot turn a bare record into acoustic authority",async(kind)=>{
    const f=await acousticFixture(), session=await acoustic.open(f.principal,f.workId,f.sessionInput,f.binding,randomUUID());
    if(kind==="door") {
      await pool.query('DELETE FROM studio_mutation_receipt WHERE "resultRevisionId"=$1',[f.door.revisionId]);
      await expect(acoustic.door(f.principal,f.workId,"zone")).rejects.toMatchObject({reason:"proof"});
    } else {
      await pool.query('DELETE FROM studio_mutation_receipt WHERE response->>\'sessionEpoch\'=$1',[session.sessionEpoch]);
    }
    await expect(acoustic.current(f.principal,f.workId,session.sessionEpoch)).rejects.toMatchObject({reason:"proof"});
    expect((await genericLocks.snapshot(f.workId)).locks).toHaveLength(0);
  });
  it("membership revocation while renewal waits on the work lock denies the lease without extending it",async()=>{
    const f=await acousticFixture(), actor=await member(f.workId,"viewer"), principal={...f.principal,userId:actor};
    const {door}=await acoustic.changeDoor(f.principal,f.workId,{...f.doorInput,expectedDoorEpoch:f.door.epoch,allowedUserIds:[actor]},randomUUID());
    const session=await acoustic.open(principal,f.workId,{...f.sessionInput,doorEpoch:door.epoch},f.binding,randomUUID());
    const blocker=await pool.connect();let pending:Promise<unknown>|undefined;
    try {
      await blocker.query("BEGIN");await blocker.query('SELECT id FROM creator_work WHERE id=$1 FOR UPDATE',[f.workId]);
      pending=acoustic.current(principal,f.workId,session.sessionEpoch,session.leaseRevision);
      const outcome=pending.then(value=>({value}), (error:unknown)=>({error}));
      await expect.poll(async()=>Number((await pool.query(`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM creator_work WHERE id=$1 FOR NO KEY UPDATE'`)).rows[0]?.count),{timeout:5000}).toBeGreaterThan(0);
      await blocker.query('DELETE FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2',[f.workId,actor]);await blocker.query("COMMIT");
      expect(await outcome).toMatchObject({error:{operation:"view"}});
      const row=await pool.query<{revision:string;expiresAt:Date}>('SELECT revision::text,"expiresAt" FROM creator_work_live_lock WHERE "leaseId"=$1',[session.sessionEpoch]);
      expect(row.rows[0]?.revision).toBe(session.leaseRevision);expect(row.rows[0]?.expiresAt.toISOString()).toBe(session.expiresAt);
      await acoustic.revoke(actor,f.workId,session.sessionEpoch);
      expect((await pool.query('SELECT 1 FROM creator_work_live_lock WHERE "workId"=$1',[f.workId])).rowCount).toBe(0);
    }finally {await blocker.query("ROLLBACK");blocker.release();await pending?.catch(()=>undefined);}
  });
  it("shares the lease advisory lock without deadlocking an existing generic writer's FK key-share",async()=>{
    const f=await acousticFixture(), blocker=await pool.connect();let pending:Promise<unknown>|undefined;
    try {
      await blocker.query("BEGIN");await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',["toonspectrum:creator-work-live-lock:v1:"+f.workId]);
      pending=acoustic.open(f.principal,f.workId,f.sessionInput,f.binding,randomUUID());
      const outcome=pending.then(value=>({value}), (error:unknown)=>({error}));
      await expect.poll(async()=>Number((await pool.query(`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE 'SELECT pg_advisory_xact_lock%'`)).rows[0]?.count),{timeout:5000}).toBeGreaterThan(0);
      await blocker.query("SET LOCAL lock_timeout='2s'");
      await blocker.query(`INSERT INTO creator_work_live_lock ("workId","resourceId","leaseId","acquisitionId","ownerConnectionId","ownerName",revision,"expiresAt") VALUES ($1,'seat:generic','generic','generic','generic','Generic',1,statement_timestamp()+interval '15 seconds')`,[f.workId]);
      await blocker.query("COMMIT");
      expect(await outcome).toMatchObject({value:{kind:"acoustic-session-lease-only"}});
      expect((await genericLocks.snapshot(f.workId)).locks.map(row=>row.resourceId)).toEqual(["seat:generic"]);
    }finally{await blocker.query("ROLLBACK");blocker.release();await pending?.catch(()=>undefined);}
  });
  it("bootstraps the graph transactionally and returns the exact server-pinned manifest/hash", async () => {
    const f = await fixture(); expect(await repository.current(f.actor, f.workId)).toBeNull();
    const published = await repository.publish(f.actor, f.workId, input(), randomUUID());
    expect(published.replayed).toBe(false); expect(published.publication.manifest).toEqual(input().manifest);
    expect(published.publication.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(await repository.current(f.actor, f.workId)).toEqual(published.publication);
    expect((await graph.getProjectByWork(f.actor, f.workId)).artifacts).toHaveLength(1);
  });
  it.each(["editor", "commenter", "viewer"] as const)("allows %s current reads but denies publishing, even with valid expected head", async (role) => {
    const f = await fixture(), actor = await member(f.workId, role);
    const first = await repository.publish(f.actor, f.workId, input(), randomUUID());
    expect(await repository.current(actor, f.workId)).toEqual(first.publication);
    await expect(repository.publish(actor, f.workId, input(first.publication.revisionId), randomUUID())).rejects.toMatchObject({ operation: "manage" });
  });
  it("allows a current admin to publish but denies absent/pending members all reads", async () => {
    const f = await fixture(), admin = await member(f.workId, "admin"), pending = await member(f.workId, "admin", "pending"), outsider = await user();
    const first = await repository.publish(admin, f.workId, input(), randomUUID()); expect(first.publication.publishedBy).toBe(admin);
    for (const actor of [pending, outsider]) { await expect(repository.current(actor, f.workId)).rejects.toMatchObject({ operation: "view" });
      await expect(repository.publish(actor, f.workId, input(first.publication.revisionId), randomUUID())).rejects.toMatchObject({ operation: "manage" }); }
  });
  it("replays exact normalized input once, rejects a changed body, and rechecks current access on replay", async () => {
    const f = await fixture(), actor = await member(f.workId, "admin"), key = randomUUID();
    const first = await repository.publish(actor, f.workId, input(), key);
    expect(await repository.publish(actor, f.workId, input(), key)).toEqual({ ...first, replayed: true });
    await expect(repository.publish(actor, f.workId, input(null, "Changed"), key)).rejects.toMatchObject({ message: "studio_idempotency_conflict" });
    await pool.query('DELETE FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [f.workId, actor]);
    await expect(repository.publish(actor, f.workId, input(), key)).rejects.toMatchObject({ operation: "manage" });
    expect(await repository.current(f.actor, f.workId)).toEqual(first.publication);
  });
  it("serializes CAS competitors and preserves unchanged graph/source on a stale publish", async () => {
    const f = await fixture(); const first = await repository.publish(f.actor, f.workId, input(), randomUUID());
    const attempts = await Promise.allSettled(["A", "B"].map((label) => repository.publish(f.actor, f.workId, input(first.publication.revisionId, label), randomUUID())));
    expect(attempts.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((value) => value.status === "rejected")).toHaveLength(1);
    const current = await repository.current(f.actor, f.workId); expect(current?.sequence).toBe(2);
    await expect(repository.publish(f.actor, f.workId, input(first.publication.revisionId), randomUUID())).rejects.toMatchObject({ currentPublishedRevisionId: current?.revisionId });
    expect(await repository.current(f.actor, f.workId)).toEqual(current);
  });
  it("undo is a new explicit CAS publication while old-key replay never rewinds current", async () => {
    const f = await fixture(), key = randomUUID(); const first = await repository.publish(f.actor, f.workId, input(), key);
    const second = await repository.publish(f.actor, f.workId, input(first.publication.revisionId, "New"), randomUUID());
    const undo = await repository.publish(f.actor, f.workId, { ...input(second.publication.revisionId), manifest: first.publication.manifest }, randomUUID());
    expect(undo.publication.contentHash).toBe(first.publication.contentHash); expect(undo.publication.sequence).toBe(3);
    expect(undo.publication.revisionId).not.toBe(first.publication.revisionId);
    expect((await repository.publish(f.actor, f.workId, input(), key)).publication).toEqual(first.publication);
    expect(await repository.current(f.actor, f.workId)).toEqual(undo.publication);
  });
  it("blocks generic graph bootstrap, commit and restore from forging publication or rewinding head", async () => {
    const f = await fixture(), first = await repository.publish(f.actor, f.workId, input(), randomUUID());
    const p = first.publication, createdAt = new Date().toISOString();
    const create = CreateStudioProjectGraphSchema.parse({ workId: f.workId, projectId: p.projectId, workspaceId: randomUUID(), artifact: { id: p.artifactId, kind: "asset", title: "Spoof", scope: { projectId: p.projectId } }, initialRevision: { id: randomUUID(), rootGraphHash: "a".repeat(64), deviceId: "device", createdAt, blobRefs: [] } });
    await expect(graph.createProject(f.actor, create, randomUUID())).rejects.toMatchObject({ causeCode: "world_publication_endpoint_required" });
    await expect(graph.createArtifact(f.actor, p.projectId, create, randomUUID())).rejects.toMatchObject({ causeCode: "world_publication_endpoint_required" });
    const commit = CommitStudioRevisionSchema.parse({ revisionId: randomUUID(), kind: "checkpoint", parentIds: [p.revisionId], rootGraphHash: "a".repeat(64), deviceId: "device", createdAt, blobRefs: [],
      command: { id: randomUUID(), type: "studio.world.publish", scope: { projectId: p.projectId }, payloadHash: "a".repeat(64), payload: { publication: p }, issuedAt: createdAt, deterministicSeed: 1, patches: [], inversePatches: [], invalidations: [] } });
    await expect(graph.commitRevision(f.actor, p.artifactId, p.revisionId, randomUUID(), commit)).rejects.toMatchObject({ causeCode: "world_publication_endpoint_required" });
    const restore = RestoreStudioRevisionSchema.parse({ revisionId: randomUUID(), deviceId: "device", createdAt, commandId: randomUUID() });
    await expect(graph.restoreRevision(f.actor, p.artifactId, p.revisionId, p.revisionId, randomUUID(), restore)).rejects.toMatchObject({ causeCode: "world_publication_endpoint_required" });
    expect(await repository.current(f.actor, f.workId)).toEqual(p);
  });
  it("never accepts a lookalike generic operation/receipt on another graph asset as current world", async () => {
    const f = await fixture(), projectId = randomUUID(), artifactId = randomUUID(), revisionId = randomUUID(), createdAt = new Date().toISOString();
    await graph.createProject(f.actor, { workId: f.workId, projectId, workspaceId: randomUUID(), artifact: { id: artifactId, kind: "asset", title: "Not a publication", scope: { projectId } }, initialRevision: { id: revisionId, rootGraphHash: "a".repeat(64), deviceId: "client", createdAt, blobRefs: [] } }, randomUUID());
    const body = CommitStudioRevisionSchema.parse({ revisionId: randomUUID(), kind: "checkpoint", parentIds: [revisionId], rootGraphHash: "b".repeat(64), deviceId: "client", createdAt, blobRefs: [],
      command: { id: randomUUID(), type: "studio.world.publish", scope: { projectId }, payloadHash: "b".repeat(64), payload: { contract: "studio-world-receipt-v1", publication: input().manifest }, issuedAt: createdAt, deterministicSeed: 1, patches: [], inversePatches: [], invalidations: [] } });
    await graph.commitRevision(f.actor, artifactId, revisionId, randomUUID(), body);
    expect(await repository.current(f.actor, f.workId)).toBeNull();
    const real = await repository.publish(f.actor, f.workId, input(), randomUUID());
    expect(real.publication.projectId).toBe(projectId); expect(real.publication.artifactId).not.toBe(artifactId);
  });
  it("missing latest receipt fails closed instead of falling back to an older published layout", async () => {
    const f = await fixture(), first = await repository.publish(f.actor, f.workId, input(), randomUUID());
    const next = await repository.publish(f.actor, f.workId, input(first.publication.revisionId, "New"), randomUUID());
    await pool.query('DELETE FROM studio_mutation_receipt WHERE "resultRevisionId"=$1', [next.publication.revisionId]);
    await expect(repository.current(f.actor, f.workId)).rejects.toMatchObject({ causeCode: "world_publication_invalid" });
    await expect(repository.publish(f.actor, f.workId, input(next.publication.revisionId), randomUUID())).rejects.toMatchObject({ causeCode: "world_publication_invalid" });
  });
  it("ignores a stale generic head pointer and retains immutable current publication evidence", async () => {
    const f = await fixture(), first = await repository.publish(f.actor, f.workId, input(), randomUUID());
    const next = await repository.publish(f.actor, f.workId, input(first.publication.revisionId, "Second"), randomUUID());
    // Simulate an old persisted head pointer, not a publication. The current endpoint must
    // derive authority from the latest verified operation and receipt even in this fixture.
    await pool.query('UPDATE studio_artifact SET "headRevisionId"=$2 WHERE id=$1', [first.publication.artifactId, first.publication.revisionId]);
    expect(await repository.current(f.actor, f.workId)).toEqual(next.publication);
    await expect(pool.query('UPDATE studio_operation SET operation=$2::jsonb WHERE "resultRevisionId"=$1', [next.publication.revisionId, JSON.stringify({ forged: true })])).rejects.toMatchObject({ code: "55000" });
    expect(await repository.current(f.actor, f.workId)).toEqual(next.publication);
  });
  it.each(["read", "publish", "replay"] as const)("rechecks revocation after waiting on the same work lock during %s", async (operation) => {
    const f = await fixture(), actor = await member(f.workId, "admin"), key = randomUUID();
    const first = await repository.publish(actor, f.workId, input(), key);
    const blocker = await pool.connect(); let pending: Promise<unknown> | undefined;
    try {
      await blocker.query("BEGIN"); await blocker.query('SELECT id FROM creator_work WHERE id=$1 FOR UPDATE', [f.workId]);
      pending = (operation === "read" ? repository.current(actor, f.workId)
        : repository.publish(actor, f.workId, operation === "replay" ? input() : input(first.publication.revisionId), operation === "replay" ? key : randomUUID()));
      // Attach rejection handling before releasing the blocked request.
      const outcome = pending.then((value) => ({ value }), (error: unknown) => ({ error }));
      await expect.poll(async () => Number((await pool.query(`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM creator_work WHERE id=$1 FOR %'`)).rows[0]?.count), { timeout: 5000 }).toBeGreaterThan(0);
      await blocker.query('DELETE FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [f.workId, actor]);
      await blocker.query("COMMIT");
      expect(await outcome).toMatchObject({ error: { operation: operation === "read" ? "view" : "manage" } });
      expect(await repository.current(f.actor, f.workId)).toEqual(first.publication);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); await pending?.catch(() => undefined); }
  });
});
