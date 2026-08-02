export interface WallSegment {
  id: string;
  start: [number, number];
  end: [number, number];
  height: number;
  thickness: number;
}

export interface WallOpening {
  id: string;
  wallId: string;
  type: "door" | "window";
  offsetFromStart: number; // 벽 시작점으로부터의 거리 (미터)
  width: number;
  height: number;
  sillHeight: number; // 창문 턱 높이 (문인 경우 0)
}

export interface StairSpec {
  id: string;
  startPoint: [number, number, number];
  width: number;
  height: number;
  stepsCount: number;
  hasRailing: boolean;
}

export interface RoomBuildingConfig {
  id: string;
  name: string;
  walls: WallSegment[];
  openings: WallOpening[];
  stairs: StairSpec[];
  ceilingVisible: boolean;
  cameraWallTransparency: boolean; // 카메라가 벽 뒤에 있을 때 해당 벽 자동 투명화
}

export function createSimpleRectangularRoom(
  id: string,
  name: string,
  width: number,
  depth: number,
  height = 2.8,
  thickness = 0.2,
): RoomBuildingConfig {
  const hw = width / 2;
  const hd = depth / 2;

  const walls: WallSegment[] = [
    { id: "wall-south", start: [-hw, -hd], end: [hw, -hd], height, thickness },
    { id: "wall-east", start: [hw, -hd], end: [hw, hd], height, thickness },
    { id: "wall-north", start: [hw, hd], end: [-hw, hd], height, thickness },
    { id: "wall-west", start: [-hw, hd], end: [-hw, -hd], height, thickness },
  ];

  const openings: WallOpening[] = [
    {
      id: "door-main",
      wallId: "wall-south",
      type: "door",
      offsetFromStart: width * 0.4,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
    },
    {
      id: "window-north",
      wallId: "wall-north",
      type: "window",
      offsetFromStart: width * 0.3,
      width: 1.5,
      height: 1.2,
      sillHeight: 0.9,
    },
  ];

  return {
    id,
    name,
    walls,
    openings,
    stairs: [],
    ceilingVisible: true,
    cameraWallTransparency: true,
  };
}

export class Studio3DRoomBuildingKit {
  private room: RoomBuildingConfig;

  constructor(room = createSimpleRectangularRoom("room-1", "기본 방 세트", 5, 4)) {
    this.room = room;
  }

  public getRoomConfig(): RoomBuildingConfig {
    return this.room;
  }

  public addOpening(opening: WallOpening): void {
    this.room.openings.push(opening);
  }

  public addStair(stair: StairSpec): void {
    this.room.stairs.push(stair);
  }

  public setCeilingVisible(visible: boolean): void {
    this.room.ceilingVisible = visible;
  }

  public setCameraWallTransparency(enabled: boolean): void {
    this.room.cameraWallTransparency = enabled;
  }

  public computeTotalFloorArea(): number {
    // 단순 사각형 방인 경우 면적 계산
    const south = this.room.walls.find((w) => w.id === "wall-south");
    const east = this.room.walls.find((w) => w.id === "wall-east");
    if (!south || !east) return 0;

    const width = Math.hypot(south.end[0] - south.start[0], south.end[1] - south.start[1]);
    const depth = Math.hypot(east.end[0] - east.start[0], east.end[1] - east.start[1]);

    return Math.round(width * depth * 100) / 100;
  }
}
