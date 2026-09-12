import { Search, ArrowRight } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { resolveReferenceQuery } from "@toonspectrum/core/reference-query-language";

const COPY = {
  ko: {
    tag: "RESEARCH IN YOUR OWN WORDS", title: "영감은 한글로.\n자료는 더 넓게.",
    body: "만들고 싶은 장면의 복식, 소품, 공간을 찾아보세요. 지원하는 한글 소재 용어는 Met 검색어로 연결합니다.",
    label: "한글 또는 영어 소재 검색어", placeholder: "예: 중세 갑옷, 한복, 도자기", submit: "자료 찾기",
    original: "입력한 원문", resolved: "Met에 보낼 검색어", unchanged: "입력한 검색어를 그대로 사용합니다.",
    partial: "아직 지원하지 않는 단어는 원문 그대로 함께 검색합니다:", unsupported: "이 표현은 아직 사전에 없어요. 원문으로 검색하거나 영어 검색어를 입력하세요.",
    invalid: "검색어를 2~80자로 입력해 주세요. 줄바꿈과 제어 문자는 사용할 수 없습니다.",
    note: "번역 AI가 아닌 소재 용어 사전입니다. 검색 결과와 이용 조건은 원본 공급자 기준이며, 자료가 없으면 빈 결과를 표시합니다.",
    examples: ["중세 갑옷", "한복", "도자기", "건축", "고양이"],
  },
  en: {
    tag: "RESEARCH IN YOUR OWN WORDS", title: "Start with an idea.\nFind its references.",
    body: "Explore costumes, props and places. Supported Korean reference terms are mapped to Met search vocabulary.",
    label: "Reference search in Korean or English", placeholder: "Try medieval armor, Korean costume, ceramics", submit: "Find references",
    original: "Your original query", resolved: "Query sent to the Met", unchanged: "Your query will be used without translation.",
    partial: "Unsupported words stay in the query:", unsupported: "This phrase is not in the vocabulary yet. Search the original or enter English terms.",
    invalid: "Use 2–80 characters without line breaks or control characters.",
    note: "This is a curated vocabulary, not AI translation. Results and usage terms come from the source provider; missing results are never replaced by samples.",
    examples: ["medieval armor", "Korean costume", "ceramics", "architecture", "cat"],
  },
} as const;

export function CreatorReferenceSearch({ locale }: { locale: "ko" | "en" }) {
  const copy = COPY[locale];
  const navigate = useNavigate();
  const id = useId();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const resolution = resolveReferenceQuery(query);
  const invalid = submitted && resolution.status === "invalid";
  return (
    <div className="cf-research">
      <div><p className="cf-kicker">{copy.tag}</p><h2 id="creator-desk-title" tabIndex={-1}>{copy.title}</h2><p>{copy.body}</p></div>
      <div className="cf-search-card">
        <form onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (resolution.status === "invalid") return;
          navigate(`/research/assets?${new URLSearchParams({ q: resolution.original }).toString()}`);
        }}>
          <label htmlFor={id}>{copy.label}</label>
          <div className="cf-search-field"><Search size={20} aria-hidden="true" /><input id={id} value={query} maxLength={80} placeholder={copy.placeholder} aria-invalid={invalid || undefined} aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ""}`} onChange={(event) => { setQuery(event.target.value); setSubmitted(false); }} /><button type="submit">{copy.submit}<ArrowRight size={17} aria-hidden="true" /></button></div>
          {invalid && <p id={`${id}-error`} role="alert">{copy.invalid}</p>}
        </form>
        <div className="cf-query-examples">{copy.examples.map((example) => <button type="button" key={example} onClick={() => { setQuery(example); setSubmitted(false); }}>{example}</button>)}</div>
        <div className="cf-query-preview" id={`${id}-hint`}>
          {resolution.status === "translated" || resolution.status === "partial" ? <><span>{copy.resolved}</span><strong>{resolution.providerQuery}</strong>{resolution.unresolved.length > 0 && <p>{copy.partial} {resolution.unresolved.join(", ")}</p>}</> : <p>{resolution.status === "unsupported" ? copy.unsupported : copy.unchanged}</p>}
        </div>
        <p className="cf-storage-note">{copy.note}</p>
      </div>
    </div>
  );
}
