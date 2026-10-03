import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { StudioLiveCollaborationProvider } from "../live/StudioLiveCollaborationProvider";
import { useStudioLiveTransportAuth } from "../live/use-studio-live-transport-auth";
import { readStudioVirtualArtStyle, writeStudioVirtualArtStyle, type StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { resolveStudioVirtualBuiltinWorld } from "./studio-virtual-space-campus-world";
import { parseCodeInviteFragment } from "./studio-virtual-space-entry-code";
import {
  normalizeStudioVirtualSpaceNickname,
  readStudioVirtualSpaceEntryPreference,
  studioVirtualSpaceNicknameFromAccount,
  validStudioVirtualSpaceAvatarIndex,
  writeStudioVirtualSpaceEntryPreference,
} from "./studio-virtual-space-entry-preference";
import {
  createStudioGuestSession,
  parseStudioGuestInviteFragment,
  readStudioGuestSession,
  writeStudioGuestSession,
  type StudioGuestSession,
} from "./studio-virtual-space-guest-session";
import {
  clearStudioVirtualSpaceLastPosition,
  readStudioVirtualSpaceLastPosition,
  studioVirtualSpaceResumeDecision,
} from "./studio-virtual-space-last-position";
import {
  readStudioVirtualPlaceId,
  studioVirtualPlaceById,
  studioVirtualPlaceSearch,
} from "./studio-virtual-space-place-world";
import {
  clearStudioVirtualSpaceSessionPoint,
  studioVirtualSpacePositionScope,
  writeStudioVirtualSpaceSessionPoint,
} from "./studio-virtual-space-session-position";
import { StudioVirtualSpaceEntryLobby } from "./StudioVirtualSpaceEntryLobby";
import { VirtualSpaceExperience } from "./StudioVirtualSpacePage";
import { useStudioWorldPublication } from "./world-publication/use-studio-world-publication";

function decodeProjectId(projectId: string): string {
  try {
    return decodeURIComponent(projectId);
  } catch {
    return projectId;
  }
}

function validProjectId(projectId: string): boolean {
  return Boolean(projectId && projectId !== "." && projectId !== ".." && projectId.length <= 160 && !projectId.includes("\\"));
}

export function StudioVirtualSpacePage({ projectIdOverride, homeHeader, personal = false }: { readonly projectIdOverride?: string; readonly homeHeader?: ReactNode; readonly personal?: boolean } = {}) {
  const bt = useBilingual("StudioVirtualSpacePage");
  const { projectId = "" } = useParams<{ projectId: string }>();
  const decodedProjectId = projectIdOverride ?? decodeProjectId(projectId);
  const location = useLocation();
  const initialEntryPreference = useMemo(() => readStudioVirtualSpaceEntryPreference(), []);
  const [entryAvatarIndex, setEntryAvatarIndex] = useState(initialEntryPreference.avatarIndex);
  const [entryArtStyle, setEntryArtStyle] = useState<StudioVirtualArtStyleKey>(() => readStudioVirtualArtStyle());
  const [entryNickname, setEntryNickname] = useState(initialEntryPreference.nickname);
  const [entryOpen, setEntryOpen] = useState(() =>
    !initialEntryPreference.confirmed || new URLSearchParams(location.search).get("lobby") === "1",
  );
  const session = useSession();
  const guestInvite = useMemo(() => parseStudioGuestInviteFragment(location.hash), [location.hash]);
  // #code=XXXXXX 코드 초대도 같은 게스트 세션 흐름으로 태운다. 코드는 형식만
  // 검사하고 서버 검증은 후속 작업이다(EntryCodePanel 문서와 동일 범위).
  const codeInvite = useMemo(() => parseCodeInviteFragment(location.hash), [location.hash]);
  const [guestSession, setGuestSession] = useState<StudioGuestSession | null>(() => readStudioGuestSession());
  const isGuest = !personal && session.ready && !session.data
    && (guestInvite.token !== null || codeInvite !== null || guestSession !== null);
  const userId = session.data?.user.id ?? null;
  const accountNickname = studioVirtualSpaceNicknameFromAccount(session.data?.user.name);
  useEffect(() => {
    if (entryNickname.trim()) return;
    setEntryNickname(accountNickname ?? bt("크리에이터", "Creator"));
  }, [accountNickname, bt, entryNickname]);
  const publication = useStudioWorldPublication(decodedProjectId, userId, !entryOpen && !personal && session.ready && Boolean(userId)
    && validProjectId(decodedProjectId) && !/^(?:virtual-demo|draft|local)(?:$|[:_-])/u.test(decodedProjectId));
  const transportFactory = useStudioLiveTransportAuth({
    authReady: !entryOpen && session.ready && !personal,
    userId: personal ? null : userId,
  });
  const publicNickname = normalizeStudioVirtualSpaceNickname(entryNickname)
    ?? accountNickname
    ?? bt("게스트 크리에이터", "Guest creator");
  const participant = useMemo(() => {
    if (personal || !session.ready || !transportFactory) return null;
    return {
      displayName: publicNickname,
      role: session.data ? "editor" as const : "viewer" as const,
    };
  }, [personal, publicNickname, session.data, session.ready, transportFactory]);

  useDocumentTitle(`${personal ? bt("나의 스튜디오", "My studio") : bt("협업 스튜디오", "Collaboration Studio")} · ToonStudio`);

  // 위치 복원(W-2): 로그인 사용자의 마지막 위치 기록을 읽어 복원 방식을 정한다.
  const navigate = useNavigate();
  const [resumeChoiceMade, setResumeChoiceMade] = useState(false);
  const currentPlaceId = readStudioVirtualPlaceId(location.search, personal);
  const resumeRecord = !personal && session.ready && session.data
    ? readStudioVirtualSpaceLastPosition(decodedProjectId)
    : null;
  const resumeDecision = studioVirtualSpaceResumeDecision(resumeRecord, currentPlaceId);
  // 게이트는 입장 전에만 평가한다. 이미 들어간 뒤에는 장소가 바뀔 때마다
  // 직전 기록이 잠시 어긋나 보여도 로비로 되돌리지 않는다.
  const enteredRef = useRef(false);
  const resumeGate = resumeDecision === "ask" && !resumeChoiceMade && !enteredRef.current;
  if (!entryOpen && !resumeGate) enteredRef.current = true;
  // 같은 장소 복원은 묻지 않는다: Experience가 마운트되기 전, 렌더 단계에서 세션 위치로 심어 둔다.
  const seededResumeRef = useRef<string | null>(null);
  if (!personal && resumeRecord && resumeDecision === "silent") {
    const seedKey = `${resumeRecord.placeId}:${resumeRecord.point.x}:${resumeRecord.point.y}`;
    if (seededResumeRef.current !== seedKey) {
      seededResumeRef.current = seedKey;
      const targetWorld = resolveStudioVirtualBuiltinWorld(resumeRecord.placeId, personal);
      writeStudioVirtualSpaceSessionPoint(
        studioVirtualSpacePositionScope(decodedProjectId, false, targetWorld.positionPlaceId),
        resumeRecord.point,
      );
    }
  }
  const completeEntry = (resume: boolean) => {
    const resolvedNickname = normalizeStudioVirtualSpaceNickname(entryNickname);
    if (!resolvedNickname) return;
    const inviteToken = guestInvite.token ?? codeInvite;
    if (isGuest && inviteToken) {
      const guest = createStudioGuestSession({
        token: inviteToken,
        spaceId: decodedProjectId,
        nickname: resolvedNickname,
        spawn: guestInvite.spawn,
      });
      writeStudioGuestSession(guest);
      setGuestSession(guest);
      setEntryNickname(resolvedNickname);
      setResumeChoiceMade(true);
      setEntryOpen(false);
      return;
    }
    if (!validStudioVirtualSpaceAvatarIndex(entryAvatarIndex)) return;
    if (resumeRecord && resume) {
      const targetWorld = resolveStudioVirtualBuiltinWorld(resumeRecord.placeId, personal);
      writeStudioVirtualSpaceSessionPoint(
        studioVirtualSpacePositionScope(decodedProjectId, false, targetWorld.positionPlaceId),
        resumeRecord.point,
      );
      if (resumeRecord.placeId !== currentPlaceId) {
        const nextSearch = new URLSearchParams(studioVirtualPlaceSearch(location.search, resumeRecord.placeId, personal));
        // 이어서 시작에서는 딥링크 입구보다 저장 좌표가 우선하도록 일회성 표시를 남긴다(Experience가 소비 후 제거).
        nextSearch.set("resume", "1");
        const value = nextSearch.toString();
        navigate({ pathname: location.pathname, search: value ? `?${value}` : "" });
      }
    } else if (resumeRecord && resumeDecision === "ask") {
      // 처음부터: 지난 기록과 그 장소·현재 장소의 세션 위치를 지워 스폰에서 시작한다.
      clearStudioVirtualSpaceLastPosition(decodedProjectId);
      const recordWorld = resolveStudioVirtualBuiltinWorld(resumeRecord.placeId, personal);
      clearStudioVirtualSpaceSessionPoint(studioVirtualSpacePositionScope(decodedProjectId, false, recordWorld.positionPlaceId));
      const currentWorld = resolveStudioVirtualBuiltinWorld(currentPlaceId, personal);
      if (currentWorld.positionPlaceId !== recordWorld.positionPlaceId) {
        clearStudioVirtualSpaceSessionPoint(studioVirtualSpacePositionScope(decodedProjectId, false, currentWorld.positionPlaceId));
      }
    }
    setEntryNickname(resolvedNickname);
    void writeStudioVirtualSpaceEntryPreference(entryAvatarIndex, resolvedNickname);
    void writeStudioVirtualArtStyle(entryArtStyle);
    setResumeChoiceMade(true);
    setEntryOpen(false);
  };

  if (!validProjectId(decodedProjectId)) {
    return (
      <Container size="wide" className="py-10">
        <section className="rounded-3xl border border-line bg-card p-6" role="alert">
          <h1 className="text-xl font-black">{bt("프로젝트를 찾을 수 없어요.", "Project not found.")}</h1>
          <Link href="/studio" className={buttonClass({ className: "mt-5" })}>
            {bt("내 작업으로", "Go to My work")}
          </Link>
        </section>
      </Container>
    );
  }

  if (entryOpen || resumeGate) {
    const guestMode = isGuest;
    return <StudioVirtualSpaceEntryLobby
      avatarIndex={guestMode ? 0 : entryAvatarIndex}
      artStyle={entryArtStyle}
      nickname={entryNickname}
      returning={initialEntryPreference.confirmed && !guestMode}
      personal={personal}
      guestMode={guestMode}
      projectName={personal ? bt("나의 스튜디오", "My studio") : decodedProjectId}
      onAvatarIndex={setEntryAvatarIndex}
      onArtStyle={setEntryArtStyle}
      onNickname={setEntryNickname}
      resumePlace={resumeGate && resumeRecord
        ? { labelKo: studioVirtualPlaceById(resumeRecord.placeId).labelKo, labelEn: studioVirtualPlaceById(resumeRecord.placeId).labelEn }
        : null}
      onResume={() => completeEntry(true)}
      onEnterWithCode={session.data ? undefined : (code) => {
        const resolvedNickname = normalizeStudioVirtualSpaceNickname(entryNickname) ?? publicNickname;
        const guest = createStudioGuestSession({
          token: code,
          spaceId: decodedProjectId,
          nickname: resolvedNickname,
          spawn: guestInvite.spawn,
        });
        writeStudioGuestSession(guest);
        setGuestSession(guest);
        setEntryNickname(resolvedNickname);
        setEntryOpen(false);
      }}
      onEnter={() => completeEntry(false)}
    />;
  }

  return (
    <StudioLiveCollaborationProvider
      workId={decodedProjectId}
      participant={participant}
      currentPageId="virtual-space"
      currentTool="spatial-presence"
      outboxScope={null}
      transportFactory={transportFactory}
      serverRequired
      ephemeralOnly
      showHuddleLauncher={false}
    >
      <VirtualSpaceExperience
        key={JSON.stringify([decodedProjectId, userId, publication.snapshot.active?.scope ?? "bundled"])}
        publication={publication}
        projectId={decodedProjectId}
        initialAvatarIndexOverride={isGuest ? 0 : entryAvatarIndex}
        initialArtStyleOverride={entryArtStyle}
        nickname={publicNickname}
        onNicknameChange={(value) => {
          const resolvedNickname = normalizeStudioVirtualSpaceNickname(value);
          if (!resolvedNickname) return;
          setEntryNickname(resolvedNickname);
          if (validStudioVirtualSpaceAvatarIndex(entryAvatarIndex)) {
            void writeStudioVirtualSpaceEntryPreference(entryAvatarIndex, resolvedNickname);
          }
        }}
        homeHeader={homeHeader}
        personal={personal}
        preparing={!personal && (!session.ready || !transportFactory)}
        signedIn={!personal && Boolean(session.data)}
        isGuest={isGuest}
        guestSpawn={guestSession?.spawn ?? guestInvite.spawn}
        entryJustConfirmed={!initialEntryPreference.confirmed}
      />
    </StudioLiveCollaborationProvider>
  );
}

export default StudioVirtualSpacePage;
