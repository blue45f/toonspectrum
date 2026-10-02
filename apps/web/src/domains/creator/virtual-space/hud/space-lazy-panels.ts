/**
 * 가상 스튜디오 패널의 지연 로딩 목록. 패널은 처음 열 때만 모듈을 내려받는다.
 * Page는 이 목록만 가져다 쓰고, 각 패널 파일을 직접 가져오지 않는다.
 */
import { createStudioVirtualSpacePanel } from "../StudioVirtualSpaceOnDemandPanel";

export const StudioWorkspaceInbox = createStudioVirtualSpacePanel(() => import("../../workspace/StudioWorkspaceInbox").then((module) => ({ default: module.StudioWorkspaceInbox })));
export const StudioPrivateRoomPanel = createStudioVirtualSpacePanel(() => import("../private-room/StudioPrivateRoomPanel").then((module) => ({ default: module.StudioPrivateRoomPanel })));
export const StudioVirtualSpaceCustomizationPanel = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceCustomizationPanel").then((module) => ({ default: module.StudioVirtualSpaceCustomizationPanel })));
export const StudioVirtualSpaceExperiencePanel = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceExperiencePanel").then((module) => ({ default: module.StudioVirtualSpaceExperiencePanel })));
export const StudioWorldPublicationPanel = createStudioVirtualSpacePanel(() => import("../world-publication/StudioWorldPublicationPanel").then((module) => ({ default: module.StudioWorldPublicationPanel })));
export const StudioVirtualSpaceNpcPanel = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceNpcPanel").then((module) => ({ default: module.StudioVirtualSpaceNpcPanel })));
export const StudioVirtualSpaceTeamHub = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceTeamHub").then((module) => ({ default: module.StudioVirtualSpaceTeamHub })));
export const StudioVirtualSpaceTodayBoard = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceTodayBoard").then((module) => ({ default: module.StudioVirtualSpaceTodayBoard })));
export const StudioVirtualSpaceRtcPanel = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceRtcPanel").then((module) => ({ default: module.StudioVirtualSpaceRtcPanel })));
export const StudioVirtualSpaceP2pBoard = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceP2pBoard").then((module) => ({ default: module.StudioVirtualSpaceP2pBoard })));
export const StudioVirtualSpaceLiveAnnotationPanel = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceLiveAnnotationPanel").then((module) => ({ default: module.StudioVirtualSpaceLiveAnnotationPanel })));
export const StudioVirtualSpaceTownProgramPanel = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceTownProgramPanel").then((module) => ({ default: module.StudioVirtualSpaceTownProgramPanel })));
export const StudioVirtualSpaceRoomCatalog = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceRoomCatalog").then((module) => ({ default: module.StudioVirtualSpaceRoomCatalog })));
export const StudioVirtualSpaceSeatsPanel = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceSeatsPanel").then((module) => ({ default: module.StudioVirtualSpaceSeatsPanel })));
export const StudioVirtualSpaceSocialPanel = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceSocialPanel").then((module) => ({ default: module.StudioVirtualSpaceSocialPanel })));
export const StudioVirtualSpaceConversationPanel = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceConversationPanel").then((module) => ({ default: module.StudioVirtualSpaceConversationPanel })));
export const StudioVirtualSpaceReviewPicker = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceReviewPicker").then((module) => ({ default: module.StudioVirtualSpaceReviewPicker })));
export const StudioVirtualSpacePlaceGallery = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpacePlaceGallery").then((module) => ({ default: module.StudioVirtualSpacePlaceGallery })));
export const StudioVirtualSpaceRecordingBoothPanel = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceRecordingBoothPanel").then((module) => ({ default: module.StudioVirtualSpaceRecordingBoothPanel })));
export const StudioVirtualSpaceSpaceBookingPanel = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceSpaceBookingPanel").then((module) => ({ default: module.StudioVirtualSpaceSpaceBookingPanel })));
export const StudioVirtualSpaceGalleryViewer = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceGalleryViewer").then((module) => ({ default: module.StudioVirtualSpaceGalleryViewer })));
export const StudioVirtualSpaceEnvironmentPanel = createStudioVirtualSpacePanel(() => import("../StudioVirtualSpaceEnvironmentPanel").then((module) => ({ default: module.StudioVirtualSpaceEnvironmentPanel })));
export const WorkSessionWorkspace = createStudioVirtualSpacePanel(() => import("../../work-session/StudioWorkSessionWorkspace").then((module) => ({ default: module.StudioWorkSessionWorkspace })));
export const StudioP2pHuddleLauncher = createStudioVirtualSpacePanel<{ readonly placement?: "floating" | "inline" }>(
  () => import("../../live/huddle/StudioP2pHuddleLauncher"),
);
export const StudioVirtualAvatarCustomizer = createStudioVirtualSpacePanel(() => import("../StudioVirtualAvatarCustomizer").then((module) => ({ default: module.StudioVirtualAvatarCustomizer })));
