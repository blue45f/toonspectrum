import { Module } from "@nestjs/common";
import { OperationPolicyModule } from "./modules/operation-policy/operation-policy.module";

import { BackendCapabilitiesModule } from "./platform/adapters/backend-capabilities/backend-capabilities.module";
import { createFederatedDataPlaneDynamicModule } from "./platform/federated-data-plane/federated-data-plane.module";
import { ApiHttpInfrastructureModule } from "./runtime/api-http-infrastructure.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BusinessInquiryModule } from "./modules/business-inquiry/business-inquiry.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CommunityModule } from "./modules/community/community.module";
import { CommerceModule } from "./modules/commerce/commerce.module";
import { CreatorModule } from "./modules/creator/creator.module";
import { CreatorSupportModule } from "./modules/creator-support/creator-support.module";
import { CreatorMarketplaceModule } from "./modules/creator-marketplace/creator-marketplace.module";
import { CreatorEcosystemModule } from "./modules/creator-ecosystem/creator-ecosystem.module";
import { CreatorIntelligenceModule } from "./modules/creator-intelligence/creator-intelligence.module";
import { CreatorResourcesModule } from "./modules/creator-resources/creator-resources.module";
import { FeedbackModule } from "./modules/feedback/feedback.module";
import { FortuneModule } from "./modules/fortune/fortune.module";
import { HealthModule } from "./modules/health/health.module";
import { IntegrationPlatformModule } from "./modules/integration-platform/integration-platform.module";
import { LegalModule } from "./modules/legal/legal.module";
import { LearningModule } from "./modules/learning/learning.module";
import { MeModule } from "./modules/me/me.module";
import { MembershipWalletModule } from "./modules/membership-wallet/membership-wallet.module";
import { MembershipOperationsModule } from "./modules/membership-operations/membership-operations.module";
import { MessagingModule } from "./modules/messaging/messaging.module";
import { OgModule } from "./modules/og/og.module";
import { PersonalCloudModule } from "./modules/personal-cloud/personal-cloud.module";
import { ProductionCollaborationModule } from "./modules/production-collaboration/production-collaboration.module";
import { CareerConfirmationModule } from "./modules/recruitment/career-confirmation.module";
import { SupporterPaymentModule } from "./modules/supporter-payment/supporter-payment.module";
import { StudioAiModule } from "./modules/studio-ai/studio-ai.module";
import { StudioMusicModule } from "./modules/studio-music/studio-music.module";
import { StudioProjectGraphModule } from "./modules/studio-project-graph/studio-project-graph.module";
import { createStudioRealtimeTicketDynamicModule } from "./modules/studio-realtime-ticket/studio-realtime-ticket.integration";
import { TrafficAnalyticsModule } from "./modules/traffic-analytics/traffic-analytics.module";

const federatedDataPlaneModule =
  createFederatedDataPlaneDynamicModule(process.env);

const studioRealtimeTicketModule =
  createStudioRealtimeTicketDynamicModule(process.env);

@Module({
  imports: [
    ApiHttpInfrastructureModule,
    BackendCapabilitiesModule,
    federatedDataPlaneModule,
    AuthModule,
    CareerConfirmationModule,
    MeModule,
    MembershipWalletModule,
    MembershipOperationsModule,
    MessagingModule,
    OgModule,
    PersonalCloudModule,
    CommunityModule,
    CommerceModule,
    CatalogModule,
    AdminModule,
    OperationPolicyModule,
    TrafficAnalyticsModule,
    FeedbackModule,
    BusinessInquiryModule,
    SupporterPaymentModule,
    CreatorMarketplaceModule,
    CreatorEcosystemModule,
    CreatorIntelligenceModule,
    CreatorModule,
    CreatorSupportModule,
    ProductionCollaborationModule,
    CreatorResourcesModule,
    ...(studioRealtimeTicketModule
      ? [studioRealtimeTicketModule]
      : []),
    HealthModule,
    IntegrationPlatformModule,
    LegalModule,
    LearningModule,
    FortuneModule,
    StudioAiModule,
    StudioMusicModule,
    StudioProjectGraphModule,
  ],
})
export class AppModule {}
