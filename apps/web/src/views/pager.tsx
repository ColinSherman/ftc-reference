import { PAGE_SIZES } from "../paging";

const PER_JS =
  "var u=new URL(location.href);u.searchParams.set('per',this.value);u.searchParams.delete('page');location.href=u.pathname+u.search";

/** Prev / next plus the page-size dropdown. Hidden when the whole list fits the smallest page. */
export function Pager(props: {
  page: number;
  pages: number;
  total: number;
  start: number;
  size: number;
  href: (page: number) => string;
}) {
  if (props.total <= PAGE_SIZES[0]) return null;
  const from = props.start + 1;
  const to = Math.min(props.start + props.size, props.total);
  const fmt = (n: number) => n.toLocaleString("en-US");
  const prev = props.page > 1 ? props.href(props.page - 1) : "";
  const next = props.page < props.pages ? props.href(props.page + 1) : "";
  return (
    <div class="pager">
      <span>
        {fmt(from)}–{fmt(to)} of {fmt(props.total)}
      </span>
      {prev ? <a href={prev}>‹ Prev</a> : <span class="off">‹ Prev</span>}
      <span>
        {props.page} / {props.pages}
      </span>
      {next ? <a href={next}>Next ›</a> : <span class="off">Next ›</span>}
      <label>
        Per page{" "}
        <select {...({ onchange: PER_JS } as Record<string, string>)}>
          {PAGE_SIZES.map((n) => (
            <option value={String(n)} selected={n === props.size}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
