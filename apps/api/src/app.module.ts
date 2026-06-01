import { Module } from "@nestjs/common";
import { CommunityModule } from "./modules/community/community.module";
import { AdminModule } from "./modules/admin/admin.module";
import { MeModule } from "./modules/me/me.module";
import { CatalogModule } from "./modules/catalog/catalog.module";

@Module({
  imports: [MeModule, CommunityModule, CatalogModule, AdminModule],
})
export class AppModule {}
