import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useEffect } from "react";
import { Link } from "react-router-dom";

import { LearningRecordTools } from "./LearningRecordTools";
import { useLearningProgress } from "./use-learning-progress";

export function LearningRecordsPage() {
  const store = useLearningProgress();
  useEffect(() => { document.title = "내 학습 기록 · 툰스튜디오"; }, []);
  return (
    <div className="learn-page" lang="ko">
      <nav className="learn-navigation" aria-label={translateCurrentStaticSourceText("domains.learn.LearningRecordsPage", "ko", "웹툰 학습")}>
        <Link to="/learn">{translateCurrentStaticSourceText("domains.learn.LearningRecordsPage", "ko", "제작 강좌")}</Link><Link to="/learn/glossary">{translateCurrentStaticSourceText("domains.learn.LearningRecordsPage", "ko", "용어 사전")}</Link>
        <Link to="/learn/studio">{translateCurrentStaticSourceText("domains.learn.LearningRecordsPage", "ko", "툰스튜디오 실습")}</Link><Link to="/learn/records" aria-current="page">{translateCurrentStaticSourceText("domains.learn.LearningRecordsPage", "ko", "내 학습 기록")}</Link>
      </nav>
      <header className="learn-lesson-header">
        <p className="learn-eyebrow">{translateCurrentStaticSourceText("domains.learn.LearningRecordsPage", "en", "LEARNING RECORDS")}</p><h1>{translateCurrentStaticSourceText("domains.learn.LearningRecordsPage", "ko", "배운 과정도,")}<br />{translateCurrentStaticSourceText("domains.learn.LearningRecordsPage", "ko", "내 기록으로 남기세요.")}</h1>
        <p className="learn-intro">{translateCurrentStaticSourceText("domains.learn.LearningRecordsPage", "ko", "진행률·메모·북마크를 직접 백업하고 다른 브라우저에서도 이어 가세요. 계정 동기화가 아닌 파일 기반 복원입니다.")}</p>
      </header>
      {store.warning && <p className="learn-caution" role="status">{store.warning}</p>}
      <LearningRecordTools store={store} />
      <section className="learn-caution">
        <h2>{translateCurrentStaticSourceText("domains.learn.LearningRecordsPage", "ko", "백업 전 알아두세요")}</h2>
        <p>{translateCurrentStaticSourceText("domains.learn.LearningRecordsPage", "ko", "파일에는 실습 메모가 포함됩니다. 공유 링크에는 기록을 넣지 않으며, 백업 파일은 신뢰하는 기기에만 보관하세요. 브라우저 기록 삭제와 비공개 창 종료 전에 직접 백업해야 합니다.")}</p>
        <p>{translateCurrentStaticSourceText("domains.learn.LearningRecordsPage", "ko", "여러 탭에서 같은 메모를 동시에 편집하는 공동 작업 기능은 아닙니다. 저장 실패 중 다른 탭의 변경이 감지되면 덮어쓰지 않고 확인을 요청합니다.")}</p>
      </section>
      <Link className="learn-back" to="/learn">{translateCurrentStaticSourceText("domains.learn.LearningRecordsPage", "ko", "← 강좌로 돌아가기")}</Link>
    </div>
  );
}
