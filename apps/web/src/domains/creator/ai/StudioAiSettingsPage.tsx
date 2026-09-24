import { Navigate } from "react-router-dom";

/** Studio와 계정에 중복되던 전체 AI 폼을 하나의 canonical 설정 화면으로 통합한다. */
export function StudioAiSettingsPage() {
  return <Navigate replace to="/settings/ai?source=studio" />;
}
