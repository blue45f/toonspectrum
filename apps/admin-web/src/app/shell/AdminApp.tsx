import "../styles/admin.css";
import { OperationPolicyPanel } from "../../domains/operations/operation-policy/OperationPolicyPanel";

export function AdminApp() {
  return <main className="admin-shell">
    <header className="admin-brand" aria-label="ToonStudio 관리자">
      <a href="https://www.toonstudio.cloud/" aria-label="ToonStudio 서비스로 돌아가기">Toon<span>Studio</span></a>
      <span className="admin-brand__label">운영 관리</span>
    </header>
    <OperationPolicyPanel />
  </main>;
}
