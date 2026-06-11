import { Module } from "@nestjs/common";
import { CommunityModule } from "./modules/community/community.module";
import { AdminModule } from "./modules/admin/admin.module";
import { MeModule } from "./modules/me/me.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { AuthModule } from "./modules/auth/auth.module";
import { FeedbackModule } from "./modules/feedback/feedback.module";
import { CreatorModule } from "./modules/creator/creator.module";
import { LegalModule } from "./modules/legal/legal.module";

@Module({
  imports: [
    AuthModule,
    MeModule,
    CommunityModule,
    CatalogModule,
    AdminModule,
    FeedbackModule,
    CreatorModule,
    LegalModule,
  ],
})
export class AppModule {}
