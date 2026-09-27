import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { decodeAbiParameters, parseAbiParameters } from "viem";
import { setup, manifest, owner, other, token, badges } from "./mock";
import { writeFileSync } from "node:fs";

test("signing rejection and reverted receipt never report completion", async ({
  page,
}) => {
  const state = await setup(page, { connected: true });
  await page.goto("./");
  const approve = page.getByRole("button", {
    name: "Approve 100 BDGE",
    exact: true,
  });
  await expect(approve).toBeEnabled();
  await page.evaluate(() => Object.assign(window, { __rejectSigning: true }));
  await approve.click();
  await expect(page.locator("#create [role=alert]")).toContainText(
    "Request declined",
  );
  expect(state.calls).toHaveLength(0);
  await page.evaluate(() => Object.assign(window, { __rejectSigning: false }));
  state.receiptRevert = true;
  await approve.click();
  await expect(page.locator("#create [role=alert]")).toContainText(
    "reverted on chain",
  );
  await expect(
    page.getByRole("link", { name: "View transaction" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create badge type" }),
  ).toBeDisabled();
});

test("keyboard can approve and create; exact balances and quote limits gate spending", async ({
  page,
}) => {
  const state = await setup(page, { connected: true });
  state.balance = 50n * 10n ** 18n;
  await page.goto("./");
  const approve = page.getByRole("button", {
    name: "Approve 100 BDGE",
    exact: true,
  });
  await expect(
    page.getByText("You need more BDGE.", { exact: false }),
  ).toBeVisible();
  await expect(approve).toBeDisabled();
  state.balance = 1000n * 10n ** 18n;
  await page.getByRole("button", { name: "Refresh state" }).click();
  await expect(approve).toBeEnabled();
  await page.getByLabel(/^Badge name/).focus();
  await page.keyboard.type("Keyboard badge");
  await page.keyboard.press("Tab");
  await expect(approve).toBeFocused();
  await page.keyboard.press("Enter");
  const create = page.getByRole("button", { name: "Create badge type" });
  await expect(create).toBeEnabled();
  await create.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#create [role=status]")).toContainText(
    "Transaction confirmed",
  );
  await page.getByLabel("You pay (ETH)").fill("10");
  await page.getByRole("button", { name: "Get quote" }).click();
  await expect(page.locator("#swap [role=alert]")).toContainText(
    "exceeds your balance",
  );
  expect(state.calls.map((c) => c.fn)).toEqual(["approve", "createBadgeType"]);
});

test("static subpath, no wallet, public profile and safe disconnected controls", async ({
  page,
}) => {
  await setup(page, { wallet: false });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "Refresh state" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Approve 100 BDGE", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No browser wallet found",
  );
  await page.getByLabel("Profile wallet address").fill(other);
  await page.getByRole("button", { name: "View badges" }).click();
  await expect(page.getByText("A blank page, for now.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("unknown wallet chain adds exact supplied network, then switches again", async ({
  page,
}) => {
  await setup(page, { wrongChain: true });
  await page.goto("./");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(
    page.getByText("Wrong network.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve 100 BDGE", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Switch to Sepolia" }).click();
  await expect(
    page.getByRole("button", { name: "Approve 100 BDGE", exact: true }),
  ).toBeEnabled();
  const requests = await page.evaluate(
    () =>
      (
        window as unknown as {
          __walletRequests: { method: string; params: unknown[] }[];
        }
      ).__walletRequests,
  );
  expect(
    requests.filter((r) => r.method.startsWith("wallet_")).map((r) => r.method),
  ).toEqual([
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "wallet_switchEthereumChain",
  ]);
  expect(
    requests.find((r) => r.method === "wallet_addEthereumChain")!.params[0],
  ).toEqual(manifest.walletAddChain);
});

test("rejected wallet connection has a recoverable message", async ({
  page,
}) => {
  await setup(page, { reject: true });
  await page.goto("./");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("alert")).toContainText("Request declined");
  await expect(
    page.getByRole("button", { name: "Connect wallet" }),
  ).toBeEnabled();
});

test("approve exact fee, validate name, create, award, block duplicate, burn and hand over", async ({
  page,
}) => {
  const state = await setup(page, { connected: true });
  await page.goto("./");
  const approve = page.getByRole("button", {
    name: "Approve 100 BDGE",
    exact: true,
  });
  await expect(approve).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Create badge type" }),
  ).toBeDisabled();
  await approve.click();
  await expect(
    page.getByRole("button", { name: "Fee approved" }),
  ).toBeVisible();
  expect(state.calls[0]).toMatchObject({
    to: token.address,
    fn: "approve",
    args: [
      expect.stringMatching(new RegExp(badges.address, "i")),
      100n * 10n ** 18n,
    ],
  });
  await page.getByLabel(/^Badge name/).fill("Bad <name>");
  await page.getByRole("button", { name: "Create badge type" }).click();
  expect(state.calls).toHaveLength(1);
  await page.getByLabel(/^Badge name/).fill("Good human");
  await page.getByRole("button", { name: "Create badge type" }).click();
  await expect(page.locator("#create [role=status]")).toContainText(
    "Transaction confirmed",
  );
  expect(state.calls[1].fn).toBe("createBadgeType");
  await page.getByLabel("Badge type ID").fill("1");
  await page.getByRole("button", { name: "Load type" }).click();
  await page.getByLabel("Recipient address").fill(owner);
  const award = page.getByRole("button", { name: "Award badge", exact: false });
  await expect(award).toBeEnabled();
  await award.click();
  await expect(
    page.getByRole("button", { name: "Burn badge #1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load type" }).click();
  await award.click();
  await expect(page.getByRole("alert")).toContainText("already holds badge #1");
  expect(state.calls.filter((c) => c.fn === "award")).toHaveLength(1);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Burn badge #1", exact: true })
    .click();
  expect(state.calls.filter((c) => c.fn === "burn")).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Burn badge #1", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Burn badge #1", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Load type" }).click();
  await page.getByText("Hand over this badge type", { exact: true }).click();
  await page.getByLabel("New issuer address").fill(other);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Hand over issuer control" }).click();
  await expect(page.locator(".manage-panel [role=status]")).toContainText(
    "Transaction confirmed",
  );
  expect(state.calls.map((c) => c.fn)).toEqual([
    "approve",
    "createBadgeType",
    "award",
    "burn",
    "setIssuer",
  ]);
  await page.getByRole("button", { name: "Load type" }).click();
  await expect(award).toBeDisabled();
  expect(state.simulations).toEqual(
    expect.arrayContaining([
      "approve",
      "createBadgeType",
      "award",
      "burn",
      "setIssuer",
    ]),
  );
});

test("ETH quote and exact router encoding, slippage, expiry and simulation failure", async ({
  page,
}) => {
  const state = await setup(page, { connected: true });
  await page.goto("./");
  const getQuote = page.getByRole("button", { name: "Get quote" });
  await expect(getQuote).toBeEnabled();
  await getQuote.click();
  await expect(page.getByText("199 BDGE", { exact: true })).toBeVisible();
  state.revert = true;
  await page.getByRole("button", { name: "Swap ETH for BDGE" }).click();
  await expect(page.locator("#swap [role=alert]")).toContainText("reverted");
  expect(state.calls).toHaveLength(0);
  state.revert = false;
  await page.getByRole("button", { name: "Swap ETH for BDGE" }).click();
  await expect(page.locator("#swap [role=status]")).toContainText(
    "Transaction confirmed",
  );
  const call = state.calls[0];
  expect(call.fn).toBe("execute");
  expect(call.to.toLowerCase()).toBe(
    manifest.network.uniswapV4.universalRouter,
  );
  expect(BigInt(call.value!)).toBe(10n ** 15n);
  expect(call.args[0]).toBe("0x10");
  const [actions, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    (call.args[1] as `0x${string}`[])[0],
  );
  expect(actions).toBe("0x060c0f");
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
    ),
    params[0],
  );
  expect(swap.amountOutMinimum).toBe(199n * 10n ** 18n);
  expect(swap.poolKey.fee).toBe(manifest.pool.fee);
  expect(swap.poolKey.tickSpacing).toBe(manifest.pool.tickSpacing);
  expect(swap.poolKey.currency1.toLowerCase()).toBe(token.address);
  expect(swap.zeroForOne).toBe(true);
  expect(
    decodeAbiParameters(parseAbiParameters("address,uint256"), params[2])[1],
  ).toBe(swap.amountOutMinimum);
  await expect(getQuote).toBeEnabled();
  await getQuote.click();
  await page.clock.install();
  await page.clock.fastForward(61000);
  await expect(
    page.getByRole("button", { name: "Swap ETH for BDGE" }),
  ).toBeDisabled();
  await expect(page.getByText(/Quote expired/)).toBeVisible();
});

test("selling uses two separate exact approvals and no transaction value", async ({
  page,
}) => {
  const state = await setup(page, { connected: true });
  await page.goto("./");
  await page.getByLabel("Swap direction").selectOption("sell");
  const quote = page.getByRole("button", { name: "Get quote" });
  await expect(quote).toBeEnabled();
  await quote.click();
  await page
    .getByRole("button", { name: "1. Approve BDGE for Permit2" })
    .click();
  await expect(quote).toBeEnabled();
  await quote.click();
  await page
    .getByRole("button", { name: "2. Approve router for 1 hour" })
    .click();
  await expect(quote).toBeEnabled();
  await quote.click();
  await page.getByRole("button", { name: "Swap BDGE for ETH" }).click();
  await expect(page.locator("#swap [role=status]")).toContainText(
    "Transaction confirmed",
  );
  expect(state.calls.map((c) => c.fn)).toEqual([
    "approve",
    "approve",
    "execute",
  ]);
  expect(state.calls[0].args).toEqual([
    expect.stringMatching(new RegExp(manifest.network.uniswapV4.permit2, "i")),
    100n * 10n ** 18n,
  ]);
  expect(state.calls[1].to.toLowerCase()).toBe(
    manifest.network.uniswapV4.permit2,
  );
  expect(String(state.calls[1].args[1]).toLowerCase()).toBe(
    manifest.network.uniswapV4.universalRouter,
  );
  expect(Number(state.calls[1].args[3])).toBeGreaterThan(
    Date.now() / 1000 + 3500,
  );
  expect(BigInt(state.calls[2].value || 0)).toBe(0n);
});

test("account changes clear issuer eligibility and quotes; profile pagination is view based", async ({
  page,
}) => {
  const state = await setup(page, { connected: true, badges: 7 });
  state.count = 8n;
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Next badges" })).toBeEnabled();
  await expect(page.locator(".badge-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Next badges" }).click();
  await expect(page.locator(".badge-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Previous badges" }).click();
  await expect(page.locator(".badge-card")).toHaveCount(6);
  await page.getByText("Browse badge types", { exact: false }).click();
  await expect(page.locator(".type-list li")).toHaveCount(6);
  await page.getByRole("button", { name: "Next types" }).click();
  await expect(page.locator(".type-list li")).toHaveCount(2);
  await page.getByRole("button", { name: "Get quote" }).click();
  await page.evaluate(
    (address) =>
      (
        window as unknown as { __changeAccount: (a: string) => void }
      ).__changeAccount(address),
    other,
  );
  await expect(page.locator(".quote")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Burn badge", exact: false }),
  ).toHaveCount(0);
  await page.getByLabel("Badge type ID").fill("1");
  await page.getByRole("button", { name: "Load type" }).click();
  await expect(
    page.getByRole("button", { name: "Award badge", exact: false }),
  ).toBeDisabled();
});

test("ABI mismatch and missing runtime code fail closed", async ({ page }) => {
  const state = await setup(page, { connected: true });
  await page.route("**/abi/LaunchToken.json", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText(
    "ABI verification failed",
  );
  await expect(
    page.getByRole("button", { name: "Create badge type" }),
  ).toBeDisabled();
  await page.unroute("**/abi/LaunchToken.json");
  state.noCode = true;
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("No deployed code");
  await expect(page.getByRole("button", { name: "Get quote" })).toBeDisabled();
  state.noCode = false;
  await page.getByRole("button", { name: "Refresh state" }).click();
  await expect(page.getByRole("button", { name: "Get quote" })).toBeEnabled();
});

test("RPC outage is visible and can recover without signing", async ({
  page,
}) => {
  const state = await setup(page, { connected: true });
  state.rpcFailure = true;
  await page.goto("./");
  await expect(page.getByText(/Deployment reads failed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Get quote" })).toBeDisabled();
  state.rpcFailure = false;
  await page.getByRole("button", { name: "Refresh state" }).click();
  await expect(page.getByRole("button", { name: "Get quote" })).toBeEnabled();
  expect(state.calls).toHaveLength(0);
});

test("responsive export, keyboard focus, text reflow and automated accessibility", async ({
  page,
}) => {
  await setup(page, { connected: true, badges: 1 });
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "Approve 100 BDGE", exact: true }),
  ).toBeEnabled();
  for (const width of [1440, 900, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const contrast = await page.evaluate(() => {
    const luminance = (color: string) => {
      const [r, g, b] = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return r * 0.2126 + g * 0.7152 + b * 0.0722;
    };
    return [
      ["body", ".panel"],
      [".panel>p", ".panel"],
      [".swap-panel>p", ".swap-panel"],
      [".connect", ".connect"],
      [".danger", ".danger"],
    ].map(([f, b]) => {
      const foreground = getComputedStyle(document.querySelector(f)!).color;
      const background = getComputedStyle(
        document.querySelector(b)!,
      ).backgroundColor;
      const x = luminance(foreground),
        y = luminance(background);
      return {
        selector: f,
        backgroundSelector: b,
        foreground,
        background,
        ratio: (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05),
      };
    });
  });
  expect(contrast.every((pair) => pair.ratio >= 4.5)).toBe(true);
  await page.screenshot({
    path: "../docs/evidence/desktop.jpg",
    fullPage: true,
    type: "jpeg",
    quality: 75,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../docs/evidence/mobile.jpg",
    fullPage: true,
    type: "jpeg",
    quality: 75,
  });
  await page.reload();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  expect(
    await page
      .getByRole("link", { name: "Skip to content" })
      .evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe("solid");
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  writeFileSync(
    "../docs/evidence/design-checks.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        viewports: [1440, 900, 768, 390, 320],
        axeViolations: 0,
        overflow: false,
        textEnlargement:
          "200% root font size at 390px, no overflow; not native browser zoom",
        contrast,
        screenshots: "Connected wallet/RPC fixtures; not live account balances",
      },
      null,
      2,
    ) + "\n",
  );
});
