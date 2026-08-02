/**
 * Studio 3D Character-Scene Mixer
 *
 * 3D VRM 캐릭터와 3D 배경(방, 건물, CAD 소품)을 하나의 3D DCC 세트장에
 * 믹스(Blending/Fusion)하고, 지면 접촉(Contact), 소품 바인딩(Attachment),
 * 조명/투음영 하모니 및 카메라 투명 벽(Wall Cutaway)을 일괄 조율하는 엔진입니다.
 */

export interface ContactState {
  feetOnGround: boolean;
  groundY: number;
  seated: boolean;
  penetrationDistance: number;
}

export interface MixedCharacterNode {
  characterId: string;
  characterName: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
  attachedProps: AttachmentContract[];
  contact: ContactState;
}

export interface MixedSceneConfig {
  sceneId: string;
  sceneName: string;
  backgroundModelUrl?: string;
  sunDirection: [number, number, number];
  toonShadowBands: number;
  wallCutawayEnabled: boolean;
  characters: MixedCharacterNode[];
}

export interface AttachmentContract {
  characterId: string;
  targetBone: string;
  propId: string;
  propName: string;
  offsetPosition: [number, number, number];
}

export class Studio3DCharacterSceneMixer {
  private config: MixedSceneConfig;

  constructor(sceneId: string, sceneName = "하이브리드 3D 믹스 세트장") {
    this.config = {
      sceneId,
      sceneName,
      sunDirection: [0.5, 1.0, 0.3],
      toonShadowBands: 2,
      wallCutawayEnabled: true,
      characters: [],
    };
  }

  public getConfig(): Readonly<MixedSceneConfig> {
    return this.config;
  }

  /**
   * 3D 세트장에 VRM 캐릭터를 소환하고 지면/바닥 접촉을 자동 조율합니다.
   */
  public addCharacter(
    characterId: string,
    characterName: string,
    initialPosition: [number, number, number] = [0, 0, 0],
  ): MixedCharacterNode {
    const node: MixedCharacterNode = {
      characterId,
      characterName,
      position: initialPosition,
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      attachedProps: [],
      contact: {
        feetOnGround: true,
        groundY: 0,
        seated: false,
        penetrationDistance: 0,
      },
    };

    // 지면 스냅 보정
    node.position[1] = Math.max(node.position[1], node.contact.groundY);
    this.config.characters.push(node);
    return node;
  }

  /**
   * 3D 소품/배경 에셋을 캐릭터의 특정 본(예: 오른손, 머리, 등)에 바인딩합니다.
   */
  public attachPropToCharacter(
    characterId: string,
    propId: string,
    propName: string,
    targetBone: string,
    offsetPosition: [number, number, number] = [0, 0, 0],
  ): boolean {
    const charNode = this.config.characters.find((c) => c.characterId === characterId);
    if (!charNode) return false;

    const attachment: AttachmentContract = {
      characterId,
      targetBone,
      propId,
      propName,
      offsetPosition,
    };

    charNode.attachedProps.push(attachment);
    return true;
  }

  /**
   * 카메라 시점이 방 벽 뒤에 위치할 때 가리는 벽 자동 투명화를 토글합니다.
   */
  public setWallCutaway(enabled: boolean): void {
    this.config.wallCutawayEnabled = enabled;
  }

  /**
   * 배경과 캐릭터 전체의 카툰 툰셰이더 섀도우 단수(Bands)를 동기화합니다.
   */
  public setToonShadowBands(bands: number): void {
    this.config.toonShadowBands = Math.max(1, Math.min(8, bands));
  }

  /**
   * 믹스 상태의 요약 보고서를 생성합니다.
   */
  public generateMixSummary(): {
    sceneName: string;
    characterCount: number;
    totalAttachedProps: number;
    wallCutawayActive: boolean;
    toonShadowBands: number;
  } {
    const totalAttachedProps = this.config.characters.reduce(
      (sum, c) => sum + c.attachedProps.length,
      0,
    );

    return {
      sceneName: this.config.sceneName,
      characterCount: this.config.characters.length,
      totalAttachedProps,
      wallCutawayActive: this.config.wallCutawayEnabled,
      toonShadowBands: this.config.toonShadowBands,
    };
  }
}
