import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

// 这条守卫存在的理由,是 2026-08-03 才发现的一次漂移:
//
// 落地页在四种语言里都声明「在 SpeakPen 里改名,仓库里那份会跟着更新」。插件从不
// 做这件事——更新分支走 vault.modify(existing) 并记回 tracked.path,buildFilePath
// 只在两条创建分支上调用。而本仓库的 README 早在 2026-07-26(faee134,标题
// "Stop promising a rename the plugin does not do")就为同一句话做了修正。
// 我们在这里撤回了,在网站上又说了一周,两边套件全程绿灯。
//
// 方向很重要:那次的改动发生在**这个**仓库。任何只放在 Rails 那边的测试,在你只动
// 插件时都不会红——所以守卫必须在这里。它读网站仓库的声明清单,断言每条对外声明都
// 点名了一条本仓库里真实存在的测试。
//
// 于是删掉或改名一条证明性测试会红;改坏它证明的行为,则是那条测试自己会红。
//
// 网站仓库不在本机时打印提示并跳过——不假红。默认按同级目录找,可用
// SPEAKPEN_RAILS_REPO 覆盖。

const RAILS_REPO = process.env.SPEAKPEN_RAILS_REPO ?? resolve(__dirname, "../../speakpen");
const CLAIMS_PATH = join(RAILS_REPO, "config/product_claims.json");

interface Claim {
  id: string;
  assertion: string;
  carried_by: string[];
  proven_by: string;
}

/** 本仓库所有测试的标题。证明一条声明,就是这里有一个同名的测试。 */
function testTitlesInThisRepo(): Set<string> {
  const dir = __dirname;
  const titles = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".test.ts"))) {
    const source = readFileSync(join(dir, file), "utf8");
    // it("…") / test("…"),单双引号都收
    for (const m of source.matchAll(/\b(?:it|test)\(\s*(["'])(.*?)\1/g)) {
      titles.add(m[2]);
    }
  }
  return titles;
}

const available = existsSync(CLAIMS_PATH);
const claims: Claim[] = available
  ? (JSON.parse(readFileSync(CLAIMS_PATH, "utf8")).claims as Claim[])
  : [];

describe("public claims on speakpen.app are backed by tests in this repo", () => {
  it("every claim the site makes names a test that exists here", () => {
    if (!available) {
      console.warn(
        `\n[landing-claims] SKIPPED — 找不到 ${CLAIMS_PATH}\n` +
          `  这条守卫拦的是「插件行为改了、网站文案没跟」。网站仓库不在本机时它无法工作。\n` +
          `  改同步行为前请 checkout speakpen 仓库,或设 SPEAKPEN_RAILS_REPO 指向它。\n`
      );
      return;
    }

    const titles = testTitlesInThisRepo();
    const unproven = claims
      .filter((c) => !titles.has(c.proven_by))
      .map((c) => `${c.id} → 找不到测试 "${c.proven_by}"`);

    expect(unproven).toEqual([]);
  });

  it("the registry actually contains claims, so the check above cannot pass vacuously", () => {
    if (!available) return;
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      expect(claim.proven_by, `${claim.id} 没有点名证明它的测试`).toBeTruthy();
    }
  });
});
