/**
 * DeskCloud 위젯 마운트 — 형제 앱 공통 위젯(SurveyDesk 의 FeedbackWidget 패턴)을
 * 앱 셸에 한 번씩 마운트한다. 각 desk 는 자기 env URL(VITE_*_URL)이 설정됐을 때만
 * 렌더되며(env-gate), 미설정이면 아무것도 렌더하지 않아 앱에 무영향이다.
 *
 * - 보편 위젯(changelog 'What's new' · notify 알림벨 · search ⌘/ 팔레트)은 화면 어디서나
 *   접근 가능한 셸 레벨에 둔다.
 * - 콘텐츠 위젯(review · community · media · moderation · chat)은 명확한 단일 페이지가
 *   없으므로 비파괴적인 플로팅 런처/카드로 셸에 둔다(데모용, env 미설정 시 비활성).
 *
 * 기존 앱 기능(자체 ⌘K 커맨드 팔레트 등)을 건드리지 않기 위해 SearchDesk 팔레트는
 * ⌘/(mod+slash) 단축키로 분리한다.
 *
 * publishable 키는 브라우저 노출이 안전(pk_…)하며, 미지정 시 'pk_demo'로 폴백한다.
 */
import { useId, useState, type ReactElement } from 'react'

import { ChangelogWidget } from './changelog/ChangelogWidget'
import { ChatWidget } from './chat/ChatWidget'
import { CommunityBoard } from './community/CommunityBoard'
import { MediaUploader } from './media/MediaWidgets'
import { ReportButton } from './moderation/ReportButton'
import { NotificationBell } from './notify/NotificationBell'
import { ReviewStars } from './review/ReviewWidgets'
import { SearchPalette } from './search/SearchPalette'

const env = import.meta.env

/** DeskCloud 위젯 publishable 키 폴백(pk_demo). desk 별 전용 키가 있으면 그것을 쓴다. */
function pk(specific: string | undefined): string {
  return specific ?? 'pk_demo'
}

/**
 * 콘텐츠 위젯(review/community/media/moderation)을 한데 모은 비파괴적 플로팅 패널.
 * 명확한 마운트 페이지가 없을 때 셸 레벨 런처로 노출한다. 적어도 하나의 콘텐츠 desk env 가
 * 켜졌을 때만 런처 버튼이 보인다.
 */
function ContentDeskLauncher(): ReactElement | null {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const hasReview = Boolean(env.VITE_REVIEWDESK_URL)
  const hasCommunity = Boolean(env.VITE_COMMUNITYDESK_URL)
  const hasMedia = Boolean(env.VITE_MEDIADESK_URL)
  const hasModeration = Boolean(env.VITE_MODERATIONDESK_URL)
  const any = hasReview || hasCommunity || hasMedia || hasModeration
  if (!any) return null

  return (
    <div className="fixed bottom-20 right-4 z-[88] flex flex-col items-end gap-2 md:bottom-4">
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="DeskCloud 위젯"
          className="max-h-[70vh] w-[min(360px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-line bg-panel p-4 shadow-2xl"
        >
          {hasReview ? (
            <section className="mb-4">
              <h2 className="mb-2 text-sm font-semibold text-fg-2">리뷰</h2>
              <ReviewStars
                subjectId="toonspectrum"
                publishableKey={pk(env.VITE_REVIEWDESK_PK)}
                endpoint={env.VITE_REVIEWDESK_URL as string}
              />
            </section>
          ) : null}

          {hasCommunity ? (
            <section className="mb-4">
              <h2 className="mb-2 text-sm font-semibold text-fg-2">커뮤니티</h2>
              <CommunityBoard
                boardSlug="general"
                publishableKey={pk(env.VITE_COMMUNITYDESK_PK)}
                endpoint={env.VITE_COMMUNITYDESK_URL as string}
              />
            </section>
          ) : null}

          {hasMedia ? (
            <section className="mb-4">
              <h2 className="mb-2 text-sm font-semibold text-fg-2">미디어 업로드</h2>
              <MediaUploader
                publishableKey={pk(env.VITE_MEDIADESK_PK)}
                endpoint={env.VITE_MEDIADESK_URL as string}
              />
            </section>
          ) : null}

          {hasModeration ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-fg-2">신고</h2>
              <ReportButton
                subjectType="page"
                subjectId="toonspectrum"
                publishableKey={pk(env.VITE_MODERATIONDESK_PK)}
                endpoint={env.VITE_MODERATIONDESK_URL as string}
              />
            </section>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-line bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-lg transition-colors hover:opacity-90"
      >
        {open ? '닫기' : 'DeskCloud'}
      </button>
    </div>
  )
}

/**
 * 앱 셸에 마운트하는 DeskCloud 위젯 집합. 각 desk 는 env URL 게이팅.
 * 미설정 desk 는 렌더 트리에 추가되지 않는다.
 */
export function DeskCloudMounts(): ReactElement {
  return (
    <>
      {/* ChangelogDesk — 'What's new' 플로팅 런처(셸 레벨) */}
      {env.VITE_CHANGELOGDESK_URL ? (
        <ChangelogWidget
          publishableKey={pk(env.VITE_CHANGELOGDESK_PK)}
          endpoint={env.VITE_CHANGELOGDESK_URL}
        />
      ) : null}

      {/* NotifyDesk — 알림 벨(셸 레벨 플로팅 슬롯; recipientId 는 데모 고정) */}
      {env.VITE_NOTIFYDESK_URL ? (
        <div className="fixed left-4 top-20 z-[88]">
          <NotificationBell
            recipientId="toonspectrum-demo"
            publishableKey={pk(env.VITE_NOTIFYDESK_PK)}
            endpoint={env.VITE_NOTIFYDESK_URL}
          />
        </div>
      ) : null}

      {/* SearchDesk — ⌘/(mod+slash) 팔레트. 앱 자체 ⌘K 와 충돌 방지 위해 단축키 분리 */}
      {env.VITE_SEARCHDESK_URL ? (
        <SearchPalette
          publishableKey={pk(env.VITE_SEARCHDESK_PK)}
          endpoint={env.VITE_SEARCHDESK_URL}
          hotkey="mod+/"
        />
      ) : null}

      {/* ChatDesk — 채팅 런처(셸 레벨 플로팅) */}
      {env.VITE_CHATDESK_URL ? (
        <ChatWidget
          publishableKey={pk(env.VITE_CHATDESK_PK)}
          endpoint={env.VITE_CHATDESK_URL}
          memberId="toonspectrum-demo"
          position="bottom-left"
        />
      ) : null}

      {/* 콘텐츠 desk(review/community/media/moderation) — 비파괴 플로팅 런처 */}
      <ContentDeskLauncher />
    </>
  )
}

export default DeskCloudMounts
