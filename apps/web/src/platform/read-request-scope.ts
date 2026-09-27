/** 목록이나 상세 패널처럼 독립적으로 교체되는 읽기 요청의 수명주기를 소유한다.
 * abort() 시점에 완료된 응답이 이미 대기 중일 수 있으므로, catch와 finally를
 * 포함한 모든 상태 갱신은 isCurrent()로 보호해야 한다.
 * HTTP 취소는 서버의 쓰기를 되돌리지 않으므로 변경 요청의 롤백에 사용하지 않는다.
 */
export class ReadRequestScope {
  private current: AbortController | null = null;

  begin(): Readonly<{ signal: AbortSignal; isCurrent: () => boolean }> {
    this.cancel();
    const controller = new AbortController();
    this.current = controller;
    return {
      signal: controller.signal,
      isCurrent: () => this.current === controller && !controller.signal.aborted,
    };
  }

  cancel(): void {
    const previous = this.current;
    this.current = null;
    previous?.abort();
  }
}
