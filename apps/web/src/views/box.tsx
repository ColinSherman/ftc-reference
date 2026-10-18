import {
  type BoxColumn,
  type BoxGroup,
  type BoxScore,
  type BoxTable,
  scoutClientSpec,
} from "@ftcref/seasons";
import { raw } from "hono/html";
import { SCOUT_JS } from "../assets";
import { TeamName } from "./ui";

const GROUP_LABEL: Record<BoxGroup, string> = {
  auto: "Auto",
  tele: "Teleop",
  end: "End",
  foul: "Fouls",
};

/** Per-robot box score plus the card form. One line either way: a tally or a play-by-play. */
export function BoxScoreSection(props: {
  box: BoxScore;
  table: BoxTable;
  season: number;
  action: string;
  teams: { team: number; name: string | null; alliance: "R" | "B" }[];
}) {
  const { box, table } = props;
  const visible = box.columns.filter((c) => !c.hidden);
  const formGroups = (["auto", "tele", "end", "foul"] as const)
    .map((g) => ({ g, cols: visible.filter((c) => c.group === g && !c.officialOnly) }))
    .filter((g) => g.cols.length);
  const hasNotes = box.qual.length > 0 || box.noteMax > 0;
  return (
    <section>
      <h2 id="box">Box score</h2>
      <p class="note">
        One line per robot. A dash was not recorded — it is not a zero. Grey figures are the official
        scorekeeper. Hive tips are that count for the alliance: a tip finishes when pollen or nectar is
        scored, so each robot's tip cell stays blank. Cred is leave (3) and each park (5); a + means one of
        those was not recorded. Flower and garden points stay on the alliance line above, because ownership
        decides them.
      </p>
      <div class="scroll">
        <table class="st nosort">
          <thead>
            <tr class="grp">
              <th />
              {table.groups.map((g) => (
                <th colspan={g.span}>{g.label}</th>
              ))}
              <th title="Points this robot can be credited with alone">Cred</th>
            </tr>
            <tr>
              <th class="l">Robot</th>
              {table.headers.map((h) => (
                <th title={h.tip}>{h.label}</th>
              ))}
              <th title="Leave (3) and each park (5)">Cred</th>
            </tr>
          </thead>
          <tbody>
            {table.sides.map((side) => (
              <>
                {side.robots.map((robot) => (
                  <tr>
                    <td class="l wrap">
                      <TeamName team={robot.team} name={robot.name} av={robot.av} season={props.season} />
                      {robot.surrogate ? <span class="pill">surrogate</span> : ""}
                      {robot.dq ? <span class="pill">DQ</span> : ""}
                      {robot.noShow ? <span class="pill">no show</span> : ""}
                      {robot.sub && <div class="sub">{robot.sub}</div>}
                    </td>
                    {robot.cells.map((cell) => (
                      <td class={cell.cls} title={cell.title}>
                        {cell.text}
                      </td>
                    ))}
                    <td title={robot.creditTitle}>{robot.credit}</td>
                  </tr>
                ))}
                <tr class="ally">
                  <td class={`l ${side.alliance === "R" ? "r" : "b"}`}>{side.label}</td>
                  {side.totals.map((cell) => (
                    <td class={cell.cls} title={cell.title}>
                      {cell.text}
                    </td>
                  ))}
                  <td title={side.creditTitle}>{side.credit}</td>
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </div>
      <p class="note">
        · is a recorded no. An underline means scouts disagree with each other (gold) or with the official
        scorekeeper (red). * on a note means the cards didn't agree.
      </p>
      {table.cards.length > 0 && (
        <details>
          <summary class="note">
            {table.cards.length === 1 ? "1 scout card" : `${table.cards.length} scout cards`}
          </summary>
          <ul class="cards">
            {table.cards.map((card) => (
              <li>
                <a href={`/teams/${card.team}?season=${props.season}`}>{card.team}</a>
                {" · "}
                {card.mode === "log" ? "play-by-play" : "quick"}
                {card.by ? ` · ${card.by}` : ""}
                {" · "}
                {card.when} — {card.summary}
              </li>
            ))}
          </ul>
        </details>
      )}
      {props.teams.length > 0 && (
        <form id="scout" class="scout" method="post" action={props.action} autocomplete="off">
          <div class="sr">
            <label>
              Robot
              <select name="team" required>
                {props.teams.map((t) => (
                  <option value={String(t.team)}>
                    {t.team}
                    {t.name ? ` ${t.name}` : ""} ({t.alliance === "R" ? "red" : "blue"})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Your name or team
              <input name="by" maxlength={40} placeholder="optional" />
            </label>
            <label>
              Card
              <select name="mode">
                <option value="line">Quick line</option>
                <option value="log">Play-by-play</option>
              </select>
            </label>
          </div>
          {formGroups.map((g) => (
            <div class="sg" data-loggroup={g.g}>
              <b>{GROUP_LABEL[g.g]}</b>
              {g.cols.map((c) => (
                <Field column={c} />
              ))}
            </div>
          ))}
          {hasNotes && (
            <div class="sg">
              <b>Notes</b>
              {box.qual.map((q) => (
                <label>
                  {q.label}
                  <select name={`q_${q.key}`}>
                    <option value="">—</option>
                    {q.kind === "bool" ? (
                      <>
                        <option value="1">Yes</option>
                        <option value="0">No</option>
                      </>
                    ) : (
                      q.options?.map((o) => <option value={o.value}>{o.label}</option>)
                    )}
                  </select>
                </label>
              ))}
              {box.noteMax > 0 && (
                <label>
                  Note
                  <input name="note" maxlength={box.noteMax} placeholder="optional" />
                </label>
              )}
            </div>
          )}
          <div id="scout-log" hidden>
            <p class="note">
              Click each action in order. A checked group is complete, so anything you didn't click is a zero.
              Leave a group unchecked if you weren't watching it. Leave and park stay on the line above.
            </p>
            <div id="pperiod" class="sr">
              <button type="button" class="abtn" data-period="auto">
                Auto
              </button>
              <button type="button" class="abtn on" data-period="tele">
                Teleop
              </button>
              <span id="pwhere" />
              <button type="button" class="abtn" id="pundo">
                Undo
              </button>
            </div>
            <div id="pbar" />
            <div class="sr">
              {box.trackGroups.map((g) => (
                <label class="chk">
                  <span>
                    <input type="checkbox" name="track" value={g.key} checked />
                    Watched {g.label.toLowerCase()}
                  </span>
                </label>
              ))}
            </div>
            <ol id="plog" />
          </div>
          <input type="hidden" name="log" value="" />
          <button type="submit" class="go">
            Add to the box score
          </button>
          <p class="note">Submitting again for the same robot updates your card.</p>
        </form>
      )}
      <script type="application/json" id="scoutspec">
        {raw(JSON.stringify(scoutClientSpec(box)).replace(/</g, "\\u003c"))}
      </script>
      <script>{raw(SCOUT_JS)}</script>
    </section>
  );
}

function Field(props: { column: BoxColumn }) {
  const c = props.column;
  if (c.kind === "bool") {
    return (
      <label title={c.tip}>
        {c.form}
        <select name={`c_${c.key}`}>
          <option value="">—</option>
          <option value="1">Yes</option>
          <option value="0">No</option>
        </select>
      </label>
    );
  }
  if (c.parts && c.partForms) {
    return (
      <>
        <label title={c.tip} data-logwrap>
          {c.form}
          <input
            data-logcol
            name={`c_${c.key}`}
            type="number"
            min={0}
            max={c.max ?? 40}
            inputmode="numeric"
          />
        </label>
        <label data-logwrap>
          {c.partForms[0]}
          <input
            data-logcol
            name={`c_${c.parts[0]}`}
            type="number"
            min={0}
            max={c.max ?? 40}
            inputmode="numeric"
          />
        </label>
        <label data-logwrap>
          {c.partForms[1]}
          <input
            data-logcol
            name={`c_${c.parts[1]}`}
            type="number"
            min={0}
            max={c.max ?? 40}
            inputmode="numeric"
          />
        </label>
      </>
    );
  }
  return (
    <label title={c.tip} data-logwrap>
      {c.form}
      <input data-logcol name={`c_${c.key}`} type="number" min={0} max={c.max ?? 40} inputmode="numeric" />
    </label>
  );
}
