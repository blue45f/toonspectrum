import { Composition, registerRoot } from "remotion";

import {
  TechnologyStoryInvestorFilm,
  TechnologyStoryOverviewFilm,
  TechnologyStoryPortraitFilm,
} from "./TechnologyStoryFilm";
import { ToonStudioFilm } from "./ToonStudioFilm";

function BrandFilmRoot() {
  return <>
    <Composition id="ToonStudioLandscape" component={ToonStudioFilm} width={1280} height={720} fps={30} durationInFrames={720} />
    <Composition id="ToonStudioPortrait" component={ToonStudioFilm} width={720} height={1280} fps={30} durationInFrames={720} />
    <Composition id="ToonStudioSquare" component={ToonStudioFilm} width={1080} height={1080} fps={30} durationInFrames={720} />
    <Composition id="ToonStudioShare" component={ToonStudioFilm} width={1200} height={630} fps={30} durationInFrames={720} />
    <Composition id="TechnologyStoryLandscape" component={TechnologyStoryOverviewFilm} width={1280} height={720} fps={30} durationInFrames={2700} />
    <Composition id="TechnologyStoryInvestor" component={TechnologyStoryInvestorFilm} width={1280} height={720} fps={30} durationInFrames={1350} />
    <Composition id="TechnologyStoryPortrait" component={TechnologyStoryPortraitFilm} width={720} height={1280} fps={30} durationInFrames={1800} />
  </>;
}

registerRoot(BrandFilmRoot);
