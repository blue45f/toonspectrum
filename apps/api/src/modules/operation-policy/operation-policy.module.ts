import { Module } from "@nestjs/common";
import { dbPool } from "../../platform/database";
import { OperationPolicyController } from "./operation-policy.controller";
import { OPERATION_POLICY_POOL, OperationPolicyRepository } from "./operation-policy.repository";

@Module({ controllers: [OperationPolicyController], providers: [
  { provide: OPERATION_POLICY_POOL, useValue: dbPool }, OperationPolicyRepository,
] })
export class OperationPolicyModule {}
