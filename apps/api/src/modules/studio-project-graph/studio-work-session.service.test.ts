import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudioWorkSessionCommandError } from "@toonspectrum/studio-project-model";
import { StudioWorkSessionService } from "./studio-work-session.controller";
import { StudioWorkSessionRepository, StudioWorkSessionRepositoryError } from "./studio-work-session.repository";
import { loadArtifactAccess, StudioProjectGraphRepository } from "./studio-project-graph.repository";
import type { PoolClient } from "pg";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("../../db", () => ({ dbPool: { connect } }));
beforeEach(() => { connect.mockClear(); });
describe("work-session API boundary", () => {
  it("requires an authenticated actor before any operation", async () => {
    const service = new StudioWorkSessionService(new StudioWorkSessionRepository()), operation = vi.fn();
    await expect(service.run(undefined, operation)).rejects.toMatchObject({ status: 403 });
    expect(operation).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  });
  it.each([["forbidden", 403], ["not-found", 404], ["unavailable", 503], ["idempotency", 409], ["invalid-target", 400], ["capacity", 409]] as const)("maps %s without treating it as success", async (code, status) => {
    const service = new StudioWorkSessionService(new StudioWorkSessionRepository());
    await expect(service.run("actor", async () => { throw new StudioWorkSessionRepositoryError(code); })).rejects.toMatchObject({ status });
  });
  it("returns a conflict for stale session versions", async () => {
    const service = new StudioWorkSessionService(new StudioWorkSessionRepository());
    await expect(service.run("actor", async () => { throw new StudioWorkSessionCommandError("conflict"); })).rejects.toMatchObject({ status: 409 });
  });
  it("passes only the authenticated actor to the repository operation", async () => {
    const repository = new StudioWorkSessionRepository(), service = new StudioWorkSessionService(repository), operation = vi.fn().mockResolvedValue({ verified: true });
    expect(await service.run("actor", operation)).toEqual({ verified: true }); expect(operation).toHaveBeenCalledExactlyOnceWith("actor", repository);
  });
  it("refuses a reserved session artifact through generic graph access before reading any data", async () => {
    const query = vi.fn(), client = { query } as unknown as PoolClient;
    await expect(loadArtifactAccess(client, "actor", `studio-work-session:${"a".repeat(64)}`)).rejects.toMatchObject({ causeCode: "work_session_endpoint_required" });
    expect(query).not.toHaveBeenCalled();
  });
  it("prevents users from creating a forged session namespace through generic artifact creation", async () => {
    const graph = new StudioProjectGraphRepository();
    const input = { artifact: { id: `studio-work-session:${"a".repeat(64)}` } } as Parameters<StudioProjectGraphRepository["createProject"]>[1];
    await expect(graph.createProject("actor", input, "request-id")).rejects.toMatchObject({ causeCode: "work_session_endpoint_required" });
    expect(connect).not.toHaveBeenCalled();
  });
});
