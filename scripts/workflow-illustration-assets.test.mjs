import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const base = 'apps/web/public/brand/workflow-20260928';
const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, 'utf8'));
const expected = ['plan', 'storyboard', 'create', 'collaborate', 'review', 'publish', 'assets', 'learn', 'ai', 'recovery', 'rights', 'community'];

describe('제작 흐름 일러스트의 출처·변형·전송 예산', () => {
  it('12개 역할의 실제 생성 모델과 비용·출처를 명시한다', () => {
    expect(Object.keys(manifest.assets).sort()).toEqual([...expected].sort());
    expect(manifest.artIsIllustrative).toBe(true);
    expect(manifest.method).toContain('AI-generated');
    expect(manifest.model).toBe('gpt-image-2');
    expect(Object.keys(manifest.sources).sort()).toEqual(['production', 'support']);
    expect(manifest.sources.production.generationId).toBe('rs4O3CxbxSHemdzUc6aM');
    expect(manifest.sources.support.generationId).toBe('mWPFReR0rpIqUt9evF6i');
    expect(manifest.externalRequests).toBe(2);
    expect(manifest.newCharges).toBeCloseTo(0.2571002919708029);
    expect(manifest.currency).toBe('USD');
  });
  it('36개 WebP의 해시와 규격·형식을 검증하고 전체 1.5MB 이내다', () => {
    let total = 0;
    const hashes = new Set();
    for (const kind of expected) {
      const variants = manifest.assets[kind].variants;
      expect(variants.map((item) => item.width)).toEqual([320, 640, 960]);
      for (const item of variants) {
        const bytes = readFileSync(`${base}/${item.file}`);
        expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
        expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256);
        expect(bytes.length).toBe(item.bytes);
        expect(item.height).toBe(item.width * 5 / 8);
        expect(bytes.length).toBeLessThan(130_000);
        total += bytes.length;
        hashes.add(item.sha256);
      }
    }
    expect(hashes.size).toBe(36);
    expect(total).toBeLessThan(1_500_000);
  });
});
