import "../styles.css";
import { OperationPolicyPanel } from "../domains/operation-policy/OperationPolicyPanel";

export function AdminApp() {
  return <main className="admin-shell"><OperationPolicyPanel /></main>;
}
