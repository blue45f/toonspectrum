const TEMPLATE_BACKGROUND_IDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  confession: ["webtoon-romance-cherry-blossom", "polyhaven-background-rooftop-night"],
  "action-impact": ["webtoon-action-ruined-city", "polyhaven-background-empty-warehouse-01"],
  "daily-talk": ["webtoon-bedroom", "webtoon-convenience"],
  flashback: ["webtoon-romance-cherry-blossom", "polyhaven-background-misty-pines"],
  "tense-closeup": ["webtoon-horror-dark-tunnel", "webtoon-sf-cyberpunk-street"],
  "title-cut": ["polyhaven-background-rooftop-night", "polyhaven-background-venice-sunset"],
  "school-classroom": ["polyhaven-background-large-corridor", "polyhaven-background-cayley-interior"],
  "school-hallway": ["polyhaven-background-large-corridor", "webtoon-drama-hospital-corridor"],
  "school-rooftop": ["polyhaven-background-rooftop-night", "polyhaven-background-wide-street-01"],
  "romance-cafe": ["polyhaven-background-decor-shop", "polyhaven-background-wooden-lounge"],
  "romance-rain": ["webtoon-sf-cyberpunk-street", "polyhaven-background-crosswalk"],
  "romance-fireworks": ["webtoon-romance-carnival", "polyhaven-background-rooftop-night"],
  "action-chase": ["webtoon-action-highway-chase", "webtoon-sf-cyberpunk-street"],
  "action-standoff": ["webtoon-action-ruined-city", "polyhaven-background-empty-warehouse-01"],
  "action-awakening": ["webtoon-fantasy-dragon-peak", "webtoon-wuxia-cliff-duel"],
  "fantasy-throne": ["webtoon-wuxia-palace-courtyard", "polyhaven-background-ballroom"],
  "fantasy-summon": ["webtoon-fantasy-dragon-peak", "webtoon-action-jungle-temple"],
  "fantasy-dungeon": ["webtoon-horror-dark-tunnel", "webtoon-horror-abandoned-hospital"],
  "daily-morning-rush": ["webtoon-bedroom", "polyhaven-background-wide-street-01"],
  "daily-overtime": ["webtoon-drama-boardroom", "webtoon-sf-research-lab"],
  "narrative-cliffhanger": ["webtoon-sf-space-station", "webtoon-wuxia-cliff-duel"],
  "school-exam-silence": ["polyhaven-background-large-corridor", "polyhaven-background-cayley-interior"],
  "school-locker-note": ["polyhaven-background-large-corridor", "webtoon-drama-hospital-corridor"],
  "daily-office-negotiation": ["webtoon-drama-boardroom", "polyhaven-background-cayley-interior"],
  "daily-transit-departure": ["polyhaven-background-dresden-station-night", "polyhaven-background-subway-entrance"],
  "daily-phone-read-receipt": ["webtoon-bedroom", "polyhaven-background-wooden-lounge"],
  "romance-cafe-empty-seat": ["polyhaven-background-decor-shop", "polyhaven-background-wooden-lounge"],
  "romance-parallel-thoughts": ["webtoon-romance-cherry-blossom", "polyhaven-background-rooitou-park"],
  "fantasy-royal-letter": ["webtoon-wuxia-palace-courtyard", "polyhaven-background-ballroom"],
  "fantasy-portal-choice": ["webtoon-fantasy-dragon-peak", "polyhaven-background-kiara-1-dawn"],
  "action-security-monitor": ["webtoon-sf-research-lab", "polyhaven-background-modern-buildings-night"],
  "action-knock-suspense": ["webtoon-horror-dark-tunnel", "polyhaven-background-courtyard-night"],
  "narrative-time-montage": ["polyhaven-background-wide-street-01", "polyhaven-background-venice-sunset"],
  "narrative-chapter-divider": ["polyhaven-background-ballroom", "polyhaven-background-venice-sunset"],
  "narrative-creator-update": ["webtoon-bedroom", "webtoon-drama-boardroom"],
  "school-club-reveal": ["polyhaven-background-large-corridor", "webtoon-drama-boardroom"],
  "school-festival-crossing": ["webtoon-romance-carnival", "polyhaven-background-wide-street-01"],
  "romance-almost-touch": ["webtoon-romance-cherry-blossom", "polyhaven-background-wooden-lounge"],
  "romance-breakup-rain": ["webtoon-sf-cyberpunk-street", "polyhaven-background-crosswalk"],
  "romance-doorway-wait": ["polyhaven-background-wooden-lounge", "polyhaven-background-large-corridor"],
  "action-rooftop-chase": ["polyhaven-background-rooftop-night", "webtoon-sf-cyberpunk-street"],
  "action-impact-reaction": ["webtoon-action-ruined-city", "polyhaven-background-empty-warehouse-01"],
  "action-villain-reveal": ["webtoon-horror-abandoned-hospital", "polyhaven-background-empty-warehouse-01"],
  "fantasy-guild-quest": ["polyhaven-background-leadenhall-market", "polyhaven-background-ballroom"],
  "fantasy-level-up": ["webtoon-sf-research-lab", "webtoon-fantasy-dragon-peak"],
  "fantasy-palace-whisper": ["webtoon-wuxia-palace-courtyard", "polyhaven-background-ballroom"],
  "daily-convenience-night": ["webtoon-convenience", "polyhaven-background-courtyard-night"],
  "daily-family-dinner": ["polyhaven-background-wooden-lounge", "polyhaven-background-cayley-interior"],
  "daily-video-call": ["webtoon-bedroom", "webtoon-sf-research-lab"],
  "narrative-memory-shards": ["polyhaven-background-misty-pines", "webtoon-romance-cherry-blossom"],
  "narrative-scroll-reveal": ["polyhaven-background-wide-street-01", "polyhaven-background-large-corridor"],
  "narrative-episode-recap": ["webtoon-drama-boardroom", "webtoon-romance-carnival", "webtoon-action-ruined-city"],
  "narrative-episode-end": ["polyhaven-background-rooftop-night", "polyhaven-background-venice-sunset"],
});

const EMPTY_BACKGROUND_IDS: readonly string[] = Object.freeze([]);

export function getStudioSceneTemplateBackgroundIds(templateId: string): readonly string[] {
  return TEMPLATE_BACKGROUND_IDS[templateId] ?? EMPTY_BACKGROUND_IDS;
}

export function getStudioBackgroundTemplateIds(backgroundId: string): readonly string[] {
  return Object.freeze(Object.entries(TEMPLATE_BACKGROUND_IDS)
    .filter(([, backgroundIds]) => backgroundIds.includes(backgroundId))
    .map(([templateId]) => templateId));
}

export function listStudioSceneTemplateAssetRecommendations(): Readonly<
  Record<string, readonly string[]>
> {
  return TEMPLATE_BACKGROUND_IDS;
}
