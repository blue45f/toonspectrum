// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { initialOperationPolicy, resolveOperationPolicy } from "@toonspectrum/contracts/operation-policy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OperationPolicyPanel } from "./OperationPolicyPanel";

const mocks = vi.hoisted(()=>({load:vi.fn(),preview:vi.fn(),apply:vi.fn()}));
vi.mock('./api/operation-policy-api',()=>({loadOperationPolicy:mocks.load,previewOperationPolicy:mocks.preview,applyOperationPolicy:mocks.apply}));
const record = () => ({revision:0,draft:initialOperationPolicy(),updatedAt:'2026-09-22T00:00:00Z'});
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({policy:record(),effective:resolveOperationPolicy(record(),null,new Date()),runtimeFingerprint:null,audit:[]});
  mocks.preview.mockImplementation(async(_revision,draft)=>({expectedRevision:0,digest:'a'.repeat(64),blockedReasons:draft.mode==='paid'?['라이선스 검토가 필요합니다.']:[],
    effective:resolveOperationPolicy({...record(),draft},null,new Date()),changes:['기존 자료는 보존됩니다.']}));
  mocks.apply.mockResolvedValue({acceptedRevision:1});
});
afterEach(cleanup);
describe('operating-mode administrator UI',()=>{
  it('reads the server policy and shows billing disabled',async()=>{
    render(<OperationPolicyPanel/>);
    expect(await screen.findByText('현재: 무료 운영')).toBeTruthy();
    expect(screen.getByText('이용료 결제: 비활성')).toBeTruthy();
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('selecting paid mode does not mutate until a validated preview',async()=>{
    render(<OperationPolicyPanel/>);await screen.findByText('현재: 무료 운영');
    fireEvent.click(screen.getByRole('radio',{name:/^유료 운영$/u}));
    expect(mocks.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'변경 영향 미리보기'}));
    await screen.findByText('라이선스 검토가 필요합니다.');
    expect((screen.getByRole('button',{name:'확인한 정책 적용'}) as HTMLButtonElement).disabled).toBe(true);
  });
  it('invalidates the preview after changing any reviewed input',async()=>{
    render(<OperationPolicyPanel/>);await screen.findByText('현재: 무료 운영');
    fireEvent.click(screen.getByRole('button',{name:'변경 영향 미리보기'}));
    await screen.findByRole('button',{name:'확인한 정책 적용'});
    fireEvent.change(screen.getByLabelText('소유 워크스페이스'),{target:{value:'3'}});
    expect(screen.queryByRole('button',{name:'확인한 정책 적용'})).toBeNull();
  });
  it('applies the exact preview with a reason and idempotency ID',async()=>{
    render(<OperationPolicyPanel/>);await screen.findByText('현재: 무료 운영');
    fireEvent.change(screen.getByLabelText('변경 사유 (5자 이상)'),{target:{value:'무료 정책 한도 검증'}});
    fireEvent.click(screen.getByRole('button',{name:'변경 영향 미리보기'}));
    await screen.findByRole('button',{name:'확인한 정책 적용'});
    fireEvent.click(screen.getByRole('button',{name:'확인한 정책 적용'}));
    await waitFor(()=>expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply.mock.calls[0][0]).toBe(0);
    expect(mocks.apply.mock.calls[0][2]).toBe('a'.repeat(64));
    expect(mocks.apply.mock.calls[0][3]).toBe('무료 정책 한도 검증');
    expect(mocks.apply.mock.calls[0][4]).toMatch(/^[a-f0-9-]{36}$/u);
  });
  it('does not display stale controls if administrator access is denied',async()=>{
    mocks.load.mockRejectedValue(new Error('관리자만 접근할 수 있습니다.'));
    render(<OperationPolicyPanel/>);
    await screen.findByText('관리자만 접근할 수 있습니다.');
    expect(screen.queryByRole('radio',{name:'유료 운영'})).toBeNull();
  });
});
