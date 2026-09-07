import {
  createContext,
  forwardRef,
  useContext,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import { Link as RouterLink } from "react-router-dom";

type Href =
  | string
  | {
      pathname?: string;
      query?: Record<string, string | number | boolean | null | undefined>;
    };

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: Href;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
};

export type PreservedLinkQueryParams = Readonly<Record<string, string>>;

const PreservedLinkQueryContext = createContext<PreservedLinkQueryParams>({});

export function PreserveLinkQueryParams({
  params,
  children,
}: {
  readonly params: PreservedLinkQueryParams;
  readonly children: ReactNode;
}) {
  return (
    <PreservedLinkQueryContext.Provider value={params}>
      {children}
    </PreservedLinkQueryContext.Provider>
  );
}

function hrefToString(href: Href): string {
  if (typeof href === "string") return href;
  const pathname = href.pathname ?? "/";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(href.query ?? {})) {
    if (value !== null && value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function isExternalHref(href: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//");
}

function appendPreservedQueryParams(
  href: string,
  preserved: PreservedLinkQueryParams,
): string {
  if (isExternalHref(href) || Object.keys(preserved).length === 0) return href;
  const hashIndex = href.indexOf("#");
  const hash = hashIndex < 0 ? "" : href.slice(hashIndex);
  const withoutHash = hashIndex < 0 ? href : href.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex < 0 ? withoutHash : withoutHash.slice(0, queryIndex);
  const query = queryIndex < 0 ? "" : withoutHash.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(preserved)) {
    if (!params.has(key)) params.set(key, value);
  }
  const serialized = params.toString();
  return `${pathname}${serialized ? `?${serialized}` : ""}${hash}`;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function LinkCompat(
  { href, replace, ...props },
  ref,
) {
  const preserved = useContext(PreservedLinkQueryContext);
  const to = appendPreservedQueryParams(hrefToString(href), preserved);
  const { prefetch, scroll, ...linkProps } = props;
  const replaceFlag = replace || ((prefetch !== undefined || scroll !== undefined) && false);
  if (isExternalHref(to) || linkProps.target) {
    // 제네릭 Link 래퍼 — 콘텐츠(children)는 호출부가 linkProps에 담아 전달한다.
    // eslint-disable-next-line jsx-a11y/anchor-has-content
    return <a ref={ref} href={to} {...linkProps} />;
  }
  return <RouterLink ref={ref} to={to} replace={replaceFlag} {...linkProps} />;
});

export default Link;
