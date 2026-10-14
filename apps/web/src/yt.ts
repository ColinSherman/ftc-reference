import { recordApiUsage, YouTube } from "@ftcref/videos";
import type { AppContext } from "./env";

/** YouTube client whose every request is counted in api_usage (admin dashboard quota meter). */
export function ytFor(c: AppContext): YouTube {
  const key = c.env.YOUTUBE_API_KEY ?? "";
  const counted: typeof fetch = async (input, init) => {
    try {
      const res = await fetch(input, init);
      await recordApiUsage(c.env.DB, "youtube", 1, res.ok ? undefined : new Error(`HTTP ${res.status}`));
      return res;
    } catch (e) {
      await recordApiUsage(c.env.DB, "youtube", 1, e);
      throw e;
    }
  };
  return new YouTube(key, counted);
}
