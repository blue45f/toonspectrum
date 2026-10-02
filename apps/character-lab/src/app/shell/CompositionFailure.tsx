/**
 * 조립 실패 화면: composeCharacterLab()이 throw하면(예: 카탈로그 불변식, 영역 모듈 초기화 오류) 빈 화면 대신
 * 원인을 그대로 보여준다(무음 실패 금지).
 */
import { CatalogInvariantError } from "./catalog-registry";

export interface CompositionFailureProps {
  readonly error: unknown;
}

export function describeCompositionError(error: unknown): { readonly title: string; readonly lines: readonly string[] } {
  if (error instanceof CatalogInvariantError) {
    return { title: "프리셋 카탈로그 불변식 위반", lines: error.failures.map((failure) => `[${failure.code}] ${failure.reasonKo}`) };
  }
  if (error instanceof Error) {
    return { title: `앱 조립 실패: ${error.name}`, lines: [error.message, ...(error.stack ? [error.stack] : [])] };
  }
  return { title: "앱 조립 실패", lines: [String(error)] };
}

export function CompositionFailure({ error }: CompositionFailureProps) {
  const described = describeCompositionError(error);
  return (
    <main className="cl-composition-failure" role="alert">
      <p className="cl-eyebrow">실험 앱 · 배포 대상 아님</p>
      <h1 className="cl-title">ToonStudio Character Lab</h1>
      <h2>{described.title}</h2>
      <ul>
        {described.lines.map((line, index) => (
          <li key={`${index}:${line.slice(0, 32)}`}>
            <pre>{line}</pre>
          </li>
        ))}
      </ul>
    </main>
  );
}
