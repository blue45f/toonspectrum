import { parseResource, recordOf, textOf } from "@toonspectrum/core/creator-resources";

import type { CreatorResource, ResourceSearchResult } from "@toonspectrum/core/creator-resources";

type Request = (url: URL) => Promise<{ value: unknown; fetchedAt: string }>;

const SIZE = 12;
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const plain = (value: unknown, max = 300) => textOf(value, 2000)
  .replace(/\s+/gu, " ")
  .trim()
  .slice(0, max);

const PLACES: Record<string, readonly [number, number]> = {
  서울: [37.5665, 126.9780],
  부산: [35.1796, 129.0756],
  제주: [33.4996, 126.5312],
  도쿄: [35.6762, 139.6503],
  오키나와: [26.2124, 127.6809],
  런던: [51.5072, -0.1276],
  파리: [48.8566, 2.3522],
  뉴욕: [40.7128, -74.0060],
};

const SYMBOL_LABELS: Record<string, string> = {
  clearsky: "맑음",
  fair: "대체로 맑음",
  partlycloudy: "구름 조금",
  cloudy: "흐림",
  fog: "안개",
  lightrain: "약한 비",
  rain: "비",
  heavyrain: "강한 비",
  lightsnow: "약한 눈",
  snow: "눈",
  heavysnow: "강한 눈",
  sleet: "진눈깨비",
};
function coordinates(query: string): readonly [number, number] | null {
  const normalized = query.normalize("NFKC").trim();
  if (PLACES[normalized]) return PLACES[normalized];
  const parts = normalized.split(/[\s,;/]+/u).filter(Boolean);
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [Math.round(lat * 10000) / 10000, Math.round(lon * 10000) / 10000];
}

export function metWeatherUrl(query: string): URL | null {
  const point = coordinates(query);
  if (!point) return null;
  const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
  url.search = new URLSearchParams({ lat: String(point[0]), lon: String(point[1]) }).toString();
  return url;
}
export function validMetWeatherShape(url: URL, value: unknown): boolean {
  if (url.hostname !== "api.met.no" || url.pathname !== "/weatherapi/locationforecast/2.0/compact") return false;
  const root = recordOf(value);
  const geometry = recordOf(root.geometry);
  const properties = recordOf(root.properties);
  const meta = recordOf(properties.meta);
  return root.type === "Feature"
    && geometry.type === "Point"
    && Array.isArray(geometry.coordinates)
    && geometry.coordinates.length >= 2
    && Boolean(plain(meta.updated_at, 40))
    && Array.isArray(properties.timeseries)
    && properties.timeseries.length <= 300;
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function symbolLabel(code: string): string {
  let normalized = code;
  for (const suffix of ["_day", "_night", "_polartwilight"]) {
    if (normalized.endsWith(suffix)) normalized = normalized.slice(0, -suffix.length);
  }
  return SYMBOL_LABELS[normalized] ?? normalized.replace(/_/gu, " ");
}
function normalizeForecast(
  raw: unknown,
  fetchedAt: string,
  lat: number,
  lon: number,
): CreatorResource | null {
  const item = recordOf(raw);
  const time = textOf(item.time, 40);
  if (!time || Number.isNaN(Date.parse(time))) return null;
  const data = recordOf(item.data);
  const instant = recordOf(recordOf(data.instant).details);
  const nextHour = recordOf(data.next_1_hours);
  const nextSix = recordOf(data.next_6_hours);
  const nextTwelve = recordOf(data.next_12_hours);
  const summary = recordOf(nextHour.summary ?? nextSix.summary ?? nextTwelve.summary);
  const periodDetails = recordOf(nextHour.details ?? nextSix.details ?? nextTwelve.details);
  const code = plain(summary.symbol_code, 80);
  const temperature = numberOf(instant.air_temperature);
  const clouds = numberOf(instant.cloud_area_fraction);
  const humidity = numberOf(instant.relative_humidity);
  const wind = numberOf(instant.wind_speed);
  const windDirection = numberOf(instant.wind_from_direction);
  const precipitation = numberOf(periodDetails.precipitation_amount);
  const pressure = numberOf(instant.air_pressure_at_sea_level);
  const details = [
    temperature !== null ? `기온 ${temperature}°C` : "",
    clouds !== null ? `구름 ${clouds}%` : "",
    humidity !== null ? `습도 ${humidity}%` : "",
    wind !== null ? `바람 ${wind}m/s` : "",
    windDirection !== null ? `풍향 ${windDirection}°` : "",
    precipitation !== null ? `강수 ${precipitation}mm` : "",
    pressure !== null ? `해면기압 ${pressure}hPa` : "",
  ].filter(Boolean).join(" · ");
  return parseResource({
    id: `metweather:${lat}:${lon}:${time}`,
    provider: "metweather",
    title: `${time.replace("T", " ").replace("Z", " UTC")} · ${code ? symbolLabel(code) : "예보"}`,
    description: details,
    sourceUrl: "https://api.met.no/weatherapi/locationforecast/2.0/documentation",
    credit: "MET Norway · CC BY 4.0",
    dateLabel: time,
    license: "CC-BY-4.0",
    fetchedAt,
  });
}
export async function metWeatherSearch(
  query: string,
  page: number,
  request: Request,
): Promise<ResourceSearchResult> {
  const url = metWeatherUrl(query);
  if (!url) {
    return {
      provider: "metweather",
      status: "ready",
      items: [],
      page,
      hasMore: false,
      total: 0,
      fetchedAt: new Date().toISOString(),
      message: "도시 이름(예: 서울, 부산, 제주) 또는 위도·경도 두 값을 입력하세요. 좌표는 소수점 네 자리까지만 사용합니다.",
    };
  }
  const source = await request(url);
  if (!validMetWeatherShape(url, source.value)) throw new Error("upstream_schema");
  const root = recordOf(source.value);
  const geometry = recordOf(root.geometry);
  const coordinateValues = rows(geometry.coordinates);
  const lon = numberOf(coordinateValues[0]);
  const lat = numberOf(coordinateValues[1]);
  if (lat === null || lon === null) throw new Error("upstream_schema");
  const properties = recordOf(root.properties);
  const all = rows(properties.timeseries);
  const offset = (page - 1) * SIZE;
  const candidates = all.slice(offset, offset + SIZE);
  const normalized = candidates
    .map((item) => normalizeForecast(item, source.fetchedAt, lat, lon))
    .filter((item): item is CreatorResource => item !== null);
  const items = [...new Map(normalized.map((item) => [item.id, item])).values()];
  const updatedAt = plain(recordOf(properties.meta).updated_at, 40);
  return {
    provider: "metweather",
    status: items.length < candidates.length ? "partial" : "ready",
    items,
    page,
    hasMore: page < 20 && all.length > page * SIZE,
    total: all.length,
    fetchedAt: source.fetchedAt,
    message: `MET Norway 위치 예보 · 좌표 ${lat}, ${lon}${updatedAt ? ` · 갱신 ${updatedAt}` : ""}. 장면 연출 참고용이며 실제 안전 판단에는 현지 공식 경보를 확인하세요.`,
  };
}
