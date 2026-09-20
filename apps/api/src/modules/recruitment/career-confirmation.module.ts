import { Module } from "@nestjs/common";

import { CareerConfirmationController } from "./career-confirmation.controller";

@Module({ controllers: [CareerConfirmationController] })
export class CareerConfirmationModule {}
