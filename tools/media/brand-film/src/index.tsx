import { Composition, registerRoot } from "remotion";

import {
  PRODUCT_TOUR_DURATION_SECONDS,
  PRODUCT_TOUR_FPS,
  ToonStudioProductTour,
} from "./ProductTourFilm";
import {
  TECHNOLOGY_FILM_FPS,
  TECHNOLOGY_INVESTOR_DURATION_SECONDS,
  TECHNOLOGY_OVERVIEW_DURATION_SECONDS,
  TECHNOLOGY_PORTRAIT_DURATION_SECONDS,
  TechnologyStoryInvestorFilm,
  TechnologyStoryOverviewFilm,
  TechnologyStoryPortraitFilm,
} from "./TechnologyStoryFilm";
import { ToonStudioFilm } from "./ToonStudioFilm";
import { ToonStudioRouteHeaderFilm } from "./ToonStudioRouteHeaderFilm";

function BrandFilmRoot() {
  return <>
    <Composition id="ToonStudioLandscape" component={ToonStudioFilm} width={1280} height={720} fps={30} durationInFrames={720} />
    <Composition id="ToonStudioPortrait" component={ToonStudioFilm} width={720} height={1280} fps={30} durationInFrames={720} />
    <Composition id="ToonStudioSquare" component={ToonStudioFilm} width={1080} height={1080} fps={30} durationInFrames={720} />
    <Composition id="ToonStudioRouteHeader" component={ToonStudioRouteHeaderFilm} width={1920} height={768} fps={30} durationInFrames={720} />
    <Composition id="ToonStudioShare" component={ToonStudioFilm} width={1200} height={630} fps={30} durationInFrames={720} />
    <Composition id="ToonStudioProductTour" component={ToonStudioProductTour} width={1280} height={720} fps={PRODUCT_TOUR_FPS} durationInFrames={PRODUCT_TOUR_DURATION_SECONDS * PRODUCT_TOUR_FPS} />
    <Composition id="TechnologyStoryLandscape" component={TechnologyStoryOverviewFilm} width={1280} height={720} fps={TECHNOLOGY_FILM_FPS} durationInFrames={TECHNOLOGY_OVERVIEW_DURATION_SECONDS * TECHNOLOGY_FILM_FPS} />
    <Composition id="TechnologyStoryInvestor" component={TechnologyStoryInvestorFilm} width={1280} height={720} fps={TECHNOLOGY_FILM_FPS} durationInFrames={TECHNOLOGY_INVESTOR_DURATION_SECONDS * TECHNOLOGY_FILM_FPS} />
    <Composition id="TechnologyStoryPortrait" component={TechnologyStoryPortraitFilm} width={720} height={1280} fps={TECHNOLOGY_FILM_FPS} durationInFrames={TECHNOLOGY_PORTRAIT_DURATION_SECONDS * TECHNOLOGY_FILM_FPS} />
  </>;
}

registerRoot(BrandFilmRoot);
