import {
  BRUSH_STUDIO_V5_QUALITY_SCHEMA_VERSION,
  BRUSH_QUALITY_PROVIDERS,
  PHYSICS_PROVIDER,
  PHYSICS,
  PROVIDERS,
  GOALS,
  DEVICES,
  TRANSPORTS,
  SPACES,
  GRAMMARS,
  MOTIFS,
  PIGMENTS,
  clamp,
  createBrushQualityPolicy,
  object,
  oneOf,
  unique,
  type BrushExecutionPass,
  type BrushPhysicsId,
  type BrushProviderDescriptor,
  type BrushProviderId,
  type BrushQualityAnalysis,
  type BrushQualityIssue,
  type BrushQualityPolicy,
  type BrushQualitySeverity,
} from "./brush-studio-v5-quality-types";

export function normalizeBrushQualityPolicy(value: unknown): BrushQualityPolicy {
  const fallback = createBrushQualityPolicy();
  const source = object(value);
  const input = { ...fallback.input, ...object(source.input) };
  const material = { ...fallback.material, ...object(source.material) };
  const simulation = { ...fallback.simulation, ...object(source.simulation) };
  const pigment = { ...fallback.pigment, ...object(source.pigment) };
  const pattern = { ...fallback.pattern, ...object(source.pattern) };
  const output = { ...fallback.output, ...object(source.output) };
  const spectralSamples = oneOf([16, 24, 31, 38] as const, pigment.spectralSamples, fallback.pigment.spectralSamples);
  const lutResolution = oneOf([16, 24, 32, 48] as const, pigment.lutResolution, fallback.pigment.lutResolution);
  const tileSize = oneOf([64, 128, 256] as const, output.tileSize, fallback.output.tileSize);

  return Object.freeze({
    schemaVersion: BRUSH_STUDIO_V5_QUALITY_SCHEMA_VERSION,
    goal: oneOf(GOALS, source.goal, fallback.goal),
    device: oneOf(DEVICES, source.device, fallback.device),
    input: Object.freeze({
      transport: oneOf(TRANSPORTS, input.transport, fallback.input.transport),
      predictionPreviewOnly: input.predictionPreviewOnly === undefined ? fallback.input.predictionPreviewOnly : Boolean(input.predictionPreviewOnly),
      pressureOnset: clamp(input.pressureOnset, 0, 0.4),
      pressureSaturation: clamp(input.pressureSaturation, 0.5, 1),
      pressureGamma: clamp(input.pressureGamma, 0.2, 3),
      pressureHysteresis: clamp(input.pressureHysteresis, 0, 0.2),
      tiltDeadZoneDeg: clamp(input.tiltDeadZoneDeg, 0, 20),
      tiltSmoothing: clamp(input.tiltSmoothing, 0, 1),
      twistSmoothing: clamp(input.twistSmoothing, 0, 1),
      hoverPreview: input.hoverPreview === undefined ? fallback.input.hoverPreview : Boolean(input.hoverPreview),
      palmRejection: input.palmRejection === undefined ? fallback.input.palmRejection : Boolean(input.palmRejection),
      fingerWaterBrush: Boolean(input.fingerWaterBrush),
    }),
    material: Object.freeze({
      surfaceTooth: clamp(material.surfaceTooth, 0, 1), friction: clamp(material.friction, 0, 1), compression: clamp(material.compression, 0, 1),
      absorbency: clamp(material.absorbency, 0, 1), capillary: clamp(material.capillary, 0, 1), fiberAnisotropy: clamp(material.fiberAnisotropy, 0, 1),
      deposit: clamp(material.deposit, 0, 1), pickup: clamp(material.pickup, 0, 1), reactivation: clamp(material.reactivation, 0, 1), solvent: clamp(material.solvent, 0, 1),
      granulation: clamp(material.granulation, 0, 1), edgeDarkening: clamp(material.edgeDarkening, 0, 1), dryingRate: clamp(material.dryingRate, 0, 1),
      viscosity: clamp(material.viscosity, 0, 1), plasticity: clamp(material.plasticity, 0, 1), gloss: clamp(material.gloss, 0, 1),
    }),
    simulation: Object.freeze({
      physics: unique(PHYSICS, simulation.physics),
      wetResolution: clamp(simulation.wetResolution, 0.25, 1.5),
      pressureIterations: Math.round(clamp(simulation.pressureIterations, 4, 40)),
      diffusion: clamp(simulation.diffusion, 0, 1), advection: clamp(simulation.advection, 0, 1), evaporation: clamp(simulation.evaporation, 0, 1), settleRate: clamp(simulation.settleRate, 0, 1), gravity: clamp(simulation.gravity, -1, 1),
      bristleStrands: Math.round(clamp(simulation.bristleStrands, 8, 256)), bristleContactIterations: Math.round(clamp(simulation.bristleContactIterations, 1, 12)),
      reservoirCapacity: clamp(simulation.reservoirCapacity, 0, 1), particleCount: Math.round(clamp(simulation.particleCount, 16, 4096)),
    }),
    pigment: Object.freeze({
      provider: oneOf(PIGMENTS, pigment.provider, fallback.pigment.provider), spectralSamples, lutResolution,
      thickness: clamp(pigment.thickness, 0.02, 1), substrateBrightness: clamp(pigment.substrateBrightness, 0, 1), mixingStrength: clamp(pigment.mixingStrength, 0, 1),
      allowMixboxWhenDistinct: Boolean(pigment.allowMixboxWhenDistinct),
    }),
    pattern: Object.freeze({
      space: oneOf(SPACES, pattern.space, fallback.pattern.space), grammar: oneOf(GRAMMARS, pattern.grammar, fallback.pattern.grammar), motif: oneOf(MOTIFS, pattern.motif, fallback.pattern.motif),
      density: clamp(pattern.density, 0, 1), spacing: clamp(pattern.spacing, 0.02, 4), rotationJitter: clamp(pattern.rotationJitter, 0, 1), scaleJitter: clamp(pattern.scaleJitter, 0, 1),
      collisionAvoidance: clamp(pattern.collisionAvoidance, 0, 1), deterministic: pattern.deterministic === undefined ? fallback.pattern.deterministic : Boolean(pattern.deterministic),
    }),
    output: Object.freeze({
      tileSize, liveScale: clamp(output.liveScale, 0.25, 1), commitScale: clamp(output.commitScale, 0.5, 2), exportScale: clamp(output.exportScale, 1, 4),
      settleBudgetMs: clamp(output.settleBudgetMs, 1, 12), rasterReceipt: output.rasterReceipt === undefined ? fallback.output.rasterReceipt : Boolean(output.rasterReceipt),
    }),
    providers: unique(PROVIDERS, source.providers ?? fallback.providers),
  });
}

export function toggleBrushQualityPhysics(policy: BrushQualityPolicy, id: BrushPhysicsId): BrushQualityPolicy {
  const current = new Set(policy.simulation.physics);
  current.has(id) ? current.delete(id) : current.add(id);
  return normalizeBrushQualityPolicy({ ...policy, simulation: { ...policy.simulation, physics: [...current] } });
}

export function toggleBrushQualityProvider(policy: BrushQualityPolicy, id: BrushProviderId): BrushQualityPolicy {
  const current = new Set(policy.providers);
  current.has(id) ? current.delete(id) : current.add(id);
  current.add("native-webgpu");
  return normalizeBrushQualityPolicy({ ...policy, providers: [...current] });
}

function providerForPigment(id: BrushQualityPolicy["pigment"]["provider"]): BrushProviderId | null {
  if (id === "spectral") return "spectral";
  if (id === "open-km") return "open-km";
  if (id === "pigment-painter") return "pigment-painter";
  if (id === "mixbox") return "mixbox";
  if (id === "inkwash-density") return "inkwash";
  return null;
}

export function optimizeBrushQualityPolicy(input: BrushQualityPolicy): BrushQualityPolicy {
  const policy = normalizeBrushQualityPolicy(input);
  const physics = new Set(policy.simulation.physics);
  const providers = new Set<BrushProviderId>(policy.providers);
  providers.add("native-webgpu");
  for (const id of physics) providers.add(PHYSICS_PROVIDER[id]);
  const pigment = providerForPigment(policy.pigment.provider);
  if (pigment) providers.add(pigment);
  if (policy.pattern.grammar === "flow-field") providers.add("p5-brush");
  if (policy.pattern.grammar === "along-path" && policy.pattern.motif === "hatch") providers.add("krita-hatching");
  const output = policy.goal === "responsive"
    ? { ...policy.output, tileSize: 128 as const, liveScale: 0.5, commitScale: 0.8, exportScale: 1.5, settleBudgetMs: 2.5 }
    : policy.goal === "material"
      ? { ...policy.output, tileSize: 128 as const, liveScale: 0.75, commitScale: 1.25, exportScale: 3, settleBudgetMs: 5 }
      : policy.goal === "cinematic"
        ? { ...policy.output, tileSize: 256 as const, liveScale: 0.75, commitScale: 1.5, exportScale: 4, settleBudgetMs: 6 }
        : { ...policy.output, tileSize: 128 as const, liveScale: 0.75, commitScale: 1, exportScale: 2, settleBudgetMs: 4 };
  return normalizeBrushQualityPolicy({
    ...policy,
    providers: [...providers],
    output,
    simulation: {
      ...policy.simulation,
      pressureIterations: policy.goal === "responsive" ? Math.min(12, policy.simulation.pressureIterations) : policy.simulation.pressureIterations,
      bristleStrands: policy.goal === "responsive" ? Math.min(48, policy.simulation.bristleStrands) : policy.simulation.bristleStrands,
      bristleContactIterations: policy.goal === "responsive" ? Math.min(4, policy.simulation.bristleContactIterations) : policy.simulation.bristleContactIterations,
    },
  });
}

function findProvider(id: BrushProviderId): BrushProviderDescriptor {
  return BRUSH_QUALITY_PROVIDERS.find((provider) => provider.id === id) ?? BRUSH_QUALITY_PROVIDERS[0]!;
}

function issue(id: string, severity: BrushQualitySeverity, title: string, detail: string, fix?: string): BrushQualityIssue {
  return Object.freeze({ id, severity, title, detail, ...(fix ? { fix } : {}) });
}

function executionDomain(id: BrushProviderId): BrushExecutionPass["domain"] {
  if (["libmypaint", "hokusai", "google-ink", "krita-smudge", "krita-hairy", "krita-spray", "krita-hatching"].includes(id)) return "wasm-worker";
  if (id === "p5-brush") return "webgl-worker";
  return "webgpu";
}

export function compileBrushQualityExecutionPlan(input: BrushQualityPolicy): readonly BrushExecutionPass[] {
  const policy = optimizeBrushQualityPolicy(input);
  const passes: BrushExecutionPass[] = [
    Object.freeze({ phase: "hover", domain: "main", label: "호버 촉·틸트·접촉면", provider: "browser", canonical: false, budgetMs: 0.3 }),
    Object.freeze({ phase: "preview", domain: "input-worker", label: "교정·리샘플·안정화·예측", provider: "browser", canonical: false, budgetMs: 0.55 }),
  ];
  for (const providerId of policy.providers) {
    if (providerId === "mixbox" && !policy.pigment.allowMixboxWhenDistinct) continue;
    const settle = ["inkwash", "thin-film", "reaction-diffusion", "p5-brush"].includes(providerId);
    passes.push(Object.freeze({
      phase: settle ? "settle" : "live",
      domain: executionDomain(providerId),
      label: findProvider(providerId).role,
      provider: providerId,
      canonical: true,
      budgetMs: settle ? policy.output.settleBudgetMs : Math.max(0.35, (100 - findProvider(providerId).latency) / 16),
    }));
  }
  passes.push(Object.freeze({ phase: "commit", domain: "webgpu", label: "타일 합성·히스토리 영수증", provider: "native-webgpu", canonical: true, budgetMs: 1.4 }));
  passes.push(Object.freeze({ phase: "export", domain: "webgpu", label: "고품질 재평가·출력", provider: "native-webgpu", canonical: true, budgetMs: 6 }));
  return Object.freeze(passes);
}

export function analyzeBrushQualityPolicy(input: BrushQualityPolicy): BrushQualityAnalysis {
  const policy = optimizeBrushQualityPolicy(input);
  const physics = new Set(policy.simulation.physics);
  const providerSet = new Set(policy.providers);
  const issues: BrushQualityIssue[] = [];
  if (policy.input.pressureSaturation - policy.input.pressureOnset < 0.4) issues.push(issue("pressure-range", "error", "필압 유효 범위가 좁음", "장치 보정 후 사용할 수 있는 필압 범위가 부족합니다.", "Device Lab에서 onset과 saturation을 다시 측정하세요."));
  if (!policy.input.predictionPreviewOnly) issues.push(issue("prediction-authority", "error", "예측 입력이 canonical 상태를 변경할 수 있음", "예측 샘플은 수분·안료·히스토리를 바꾸면 안 됩니다.", "preview-only를 켜세요."));
  if (physics.has("wet-flow") && !providerSet.has("inkwash")) issues.push(issue("wet-provider", "error", "습식 authority 누락", "Wet Flow에는 Inkwash provider가 필요합니다."));
  if (physics.has("thin-film") && !physics.has("wet-flow")) issues.push(issue("thin-film-source", "warning", "박막 입력 수분이 없음", "Thin-film은 Wet Flow 또는 별도 높이 필드와 함께 써야 자연스럽습니다."));
  if (physics.has("bristle") && policy.simulation.bristleStrands * policy.simulation.bristleContactIterations > 768) issues.push(issue("bristle-cost", "warning", "강모 라이브 비용이 높음", "strand × contact iteration이 큰 상태입니다.", "라이브 LOD는 64×6 이하로 낮추고 commit에서 재평가하세요."));
  if (physics.has("wet-flow") && policy.simulation.pressureIterations > 28 && policy.output.liveScale > 0.8) issues.push(issue("wet-cost", "warning", "습식 라이브 비용이 높음", "고해상도 압력 반복은 필기 지연을 만들 수 있습니다."));
  if (policy.pigment.provider === "open-km" && policy.pigment.spectralSamples < 31) issues.push(issue("spectral-resolution", "warning", "K/S 분광 해상도가 낮음", "광물성 안료와 보색 혼합에서 색 경로가 거칠어질 수 있습니다."));
  if (policy.pigment.provider === "mixbox" && !policy.pigment.allowMixboxWhenDistinct) issues.push(issue("mixbox-gate", "error", "Mixbox 대체 불가능성 게이트가 닫힘", "Spectral/Open K/S로 재현되지 않는다는 A/B 영수증이 필요합니다."));
  if (policy.pattern.space === "document" && policy.pattern.grammar !== "continuous" && !policy.pattern.deterministic) issues.push(issue("pattern-determinism", "error", "문서 고정 패턴이 비결정적", "재생·내보내기에서 패턴 위상이 달라질 수 있습니다."));
  if ((physics.has("wet-flow") || physics.has("reaction-diffusion") || physics.has("height-field")) && !policy.output.rasterReceipt) issues.push(issue("raster-receipt", "warning", "복합 물리 영수증 비활성", "GPU 오차가 있는 물리 결과를 장치 간 동일하게 보존하기 어렵습니다."));
  if (policy.input.fingerWaterBrush && !physics.has("wet-flow")) issues.push(issue("finger-water", "warning", "손가락 물붓 대상이 없음", "손가락 물붓에는 Wet Flow가 필요합니다."));

  const providerDetails = policy.providers.map(findProvider);
  const inputLatency = 3.2 + (policy.input.transport === "move-basic" ? 5.1 : policy.input.transport === "move-coalesced" ? 2.1 : 0.8) - (policy.input.predictionPreviewOnly ? 0.8 : 0);
  const wetCost = physics.has("wet-flow") ? policy.simulation.pressureIterations * policy.simulation.wetResolution * 0.055 : 0;
  const bristleCost = physics.has("bristle") ? policy.simulation.bristleStrands * policy.simulation.bristleContactIterations * 0.0021 : 0;
  const particleCost = physics.has("particle-ballistics") ? policy.simulation.particleCount * 0.0014 : 0;
  const frameCost = 0.8 + providerDetails.reduce((sum, provider) => sum + (100 - provider.latency) / 45, 0) + wetCost + bristleCost + particleCost + (physics.has("reaction-diffusion") ? 1.2 : 0) + (physics.has("height-field") ? 0.8 : 0);
  const settleMs = 8 + (physics.has("wet-flow") ? 42 + policy.simulation.pressureIterations * 2 : 0) + (physics.has("thin-film") ? 58 : 0) + (physics.has("reaction-diffusion") ? 72 : 0) + (physics.has("height-field") ? 26 : 0);
  const fieldCount = 1 + (physics.has("wet-flow") ? 5 : 0) + (physics.has("height-field") ? 2 : 0) + (physics.has("reaction-diffusion") ? 3 : 0) + (physics.has("bristle") ? 2 : 0) + (policy.pigment.provider === "rgb" ? 0 : 1);
  const memoryMb = policy.output.tileSize ** 2 * Math.max(4, fieldCount * 4) * 64 / 1048576;
  const averageFidelity = providerDetails.reduce((sum, provider) => sum + provider.fidelity, 0) / Math.max(1, providerDetails.length);
  const score = (value: number) => Math.round(Math.min(100, Math.max(0, value)));
  const uniquenessAxes = [physics.size, policy.pattern.grammar === "continuous" ? 0 : 1, policy.pigment.provider === "rgb" ? 0 : 1, policy.material.pickup > 0.2 ? 1 : 0, policy.material.granulation > 0.2 ? 1 : 0].reduce((sum, value) => sum + value, 0);
  const metrics = Object.freeze({
    handFeel: score(92 - inputLatency * 2 + (policy.input.transport === "raw-coalesced" ? 5 : 0)),
    materialFidelity: score(46 + averageFidelity * 0.34 + policy.material.pickup * 10 + policy.material.granulation * 9 + policy.material.plasticity * 8),
    surfaceFidelity: score(44 + policy.material.surfaceTooth * 18 + policy.material.absorbency * 13 + policy.material.fiberAnisotropy * 12),
    colorFidelity: score(48 + (policy.pigment.provider === "rgb" ? 0 : 28) + policy.pigment.mixingStrength * 10),
    temporalFidelity: score(38 + (physics.has("wet-flow") ? 25 : 0) + (physics.has("thin-film") ? 18 : 0) + (physics.has("reaction-diffusion") ? 18 : 0)),
    uniqueness: score(45 + uniquenessAxes * 8),
    performance: score(105 - frameCost * 7 - inputLatency * 1.2 - memoryMb * 0.15),
    determinism: score(98 - (policy.pattern.deterministic ? 0 : 22) - (policy.output.rasterReceipt ? 0 : physics.size * 5)),
  });
  const goalWeight = policy.goal === "responsive" ? { latency: 0.55, fidelity: 0.2 } : policy.goal === "material" ? { latency: 0.16, fidelity: 0.58 } : policy.goal === "cinematic" ? { latency: 0.08, fidelity: 0.68 } : { latency: 0.32, fidelity: 0.42 };
  const providers = BRUSH_QUALITY_PROVIDERS.map((provider) => Object.freeze({
    id: provider.id,
    label: provider.label,
    selected: providerSet.has(provider.id),
    score: score(provider.latency * goalWeight.latency + provider.fidelity * goalWeight.fidelity + provider.determinism * 0.16 + provider.memory * 0.1 - (provider.status === "lab" ? 7 : 0)),
    reason: provider.webgpu ? "동등 질감이면 WebGPU 경로 우선" : provider.status === "lab" ? "고유 질감 A/B 승격 필요" : "전문 provider의 고유 물성",
  })).sort((a, b) => b.score - a.score);
  const rights = providerDetails.some((provider) => provider.rights === "private-grant") ? "private-grant" : providerDetails.some((provider) => provider.rights === "copyleft") ? "copyleft-distribution" : "commercial-safe";
  return Object.freeze({
    valid: !issues.some((entry) => entry.severity === "error"), issues: Object.freeze(issues), metrics,
    estimatedInputLatencyMs: Number(Math.max(1.5, inputLatency).toFixed(1)), estimatedFrameCostMs: Number(frameCost.toFixed(1)), estimatedSettleMs: Math.round(settleMs), estimatedGpuMemoryMb: Number(memoryMb.toFixed(1)),
    rightsProfile: rights, providers: Object.freeze(providers), executionPlan: compileBrushQualityExecutionPlan(policy),
  });
}
