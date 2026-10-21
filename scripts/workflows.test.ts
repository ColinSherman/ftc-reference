// Guards the GitHub Actions setup that keeps production credentials away from untrusted code.
// See CLAUDE.md "Environments" for the rules these enforce.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "../.github/workflows");
const workflows = readdirSync(DIR)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ file: f, src: readFileSync(join(DIR, f), "utf8") }));

/** Top-level jobs of a workflow, as raw text blocks keyed by job id. */
function jobs(src: string): Record<string, string> {
  const body = src.slice(src.search(/^jobs:\s*$/m));
  const out: Record<string, string> = {};
  let id: string | null = null;
  for (const line of body.split("\n").slice(1)) {
    const m = /^ {2}([\w-]+):\s*$/.exec(line);
    if (m?.[1]) id = m[1];
    else if (/^\S/.test(line)) break;
    if (id) out[id] = `${out[id] ?? ""}${line}\n`;
  }
  return out;
}

/** The job's environment name (`environment: x` or `environment:\n  name: x`). */
function environmentOf(job: string): string | null {
  const m = /^ {4}environment:[ \t]*(\S+)?[ \t]*$/m.exec(job);
  if (!m) return null;
  if (m[1]) return m[1];
  return /^ {6}name:\s*(\S+)/m.exec(job.slice(m.index))?.[1] ?? null;
}

describe("GitHub workflows", () => {
  it("found the workflows", () => {
    expect(workflows.map((w) => w.file)).toEqual(
      expect.arrayContaining(["deploy.yml", "stage.yml", "stage-seed.yml"]),
    );
  });

  it("never use pull_request_target (it hands repo secrets to fork PRs)", () => {
    for (const w of workflows) expect(w.src, w.file).not.toMatch(/pull_request_target/);
  });

  it("read Cloudflare credentials only inside a deployment environment", () => {
    for (const w of workflows) {
      for (const [id, job] of Object.entries(jobs(w.src))) {
        if (!/secrets\.CLOUDFLARE_API_TOKEN/.test(job)) continue;
        expect(environmentOf(job), `${w.file} job ${id} reads CLOUDFLARE_API_TOKEN`).toMatch(
          /^(production|staging)$/,
        );
      }
    }
  });

  it("use the production environment only for the production deploy", () => {
    for (const w of workflows) {
      for (const [id, job] of Object.entries(jobs(w.src))) {
        const env = environmentOf(job);
        if (env === "production") expect(`${w.file}:${id}`).toBe("deploy.yml:deploy");
      }
    }
    expect(environmentOf(jobs(workflows.find((w) => w.file === "deploy.yml")?.src ?? "").deploy ?? "")).toBe(
      "production",
    );
  });
});
