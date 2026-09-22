import { useI18n } from "@/shared/lib/i18n";
import { useCampus } from "./campus-context";

export function CampusSceneRecovery() {
  const campus = useCampus();
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  return <aside className="campus-private-note" role="alert" data-campus-scene-failure="true">
    <p>{korean ? "공간 장면을 불러오지 못했어요. 현재 입력과 작업 화면은 그대로 사용할 수 있어요." : "The scene is unavailable. Your current input and work surface remain available."}</p>
    <button type="button" className="campus-control" onClick={() => campus?.setMode("task")}>
      {korean ? "같은 작업을 업무 보기로 계속" : "Continue the same task without the scene"}
    </button>
  </aside>;
}
