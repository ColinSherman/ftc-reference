import { describe, expect, it } from "vitest";
import { parseAvatarCss } from "./avatars";

const css = `:root {
  --avatar-size: 40;
}
.team-avatar {
  background-image: url("data:image/png;base64,iVBORw0KGgo=");
  background-size: contain;
}
.team-9999 {
  background-image: url("/ftc/2027/avatars/composed/9999_04e4bf7e-828a-4742-ae97-cf12ef6e4da2");
}
.team-10006 {
  background-image: url("/ftc/2027/avatars/composed/10006_d7b306c5-5e00-4b75-b7dc-ccac86e21f4e");
}
.team-123 {
  background-image: url("/ftc/2027/avatars/composed/456_d7b306c5-5e00-4b75-b7dc-ccac86e21f4e");
}`;

describe("parseAvatarCss", () => {
  it("extracts team → key/path and skips the fallback and mismatched rules", () => {
    expect(parseAvatarCss(css)).toEqual([
      {
        team: 9999,
        key: "04e4bf7e-828a-4742-ae97-cf12ef6e4da2",
        path: "/ftc/2027/avatars/composed/9999_04e4bf7e-828a-4742-ae97-cf12ef6e4da2",
      },
      {
        team: 10006,
        key: "d7b306c5-5e00-4b75-b7dc-ccac86e21f4e",
        path: "/ftc/2027/avatars/composed/10006_d7b306c5-5e00-4b75-b7dc-ccac86e21f4e",
      },
    ]);
  });
});
