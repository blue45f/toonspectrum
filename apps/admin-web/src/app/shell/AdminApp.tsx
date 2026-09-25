import "../styles/admin.css";
import { OperationPolicyPanel } from "../../domains/operations/operation-policy/OperationPolicyPanel";

export function AdminApp() {
  return <main className="admin-shell"><OperationPolicyPanel /></main>;
}
