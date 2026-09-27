# Frontend validation

Worker validation on 2026-09-27. This is reproducible worker evidence, not independent network certification. No contract source, root build configuration, Foundry dependency, workflow or deployment was changed.

## Scope and assumptions

One static Vite/React/TypeScript page, served from the actual `dist/` export under `/preview/`. Supported behavior: injected wallet discovery/connect/switch/add-chain, balance/allowance reads, exact fee approval and create, issuer award/handover, holder burn, address profiles, paginated type enumeration and two-way Uniswap v4 controls. English/light theme only. Public RPCs provide reads; the visitor's wallet signs. The hero seal is an illustrative preview, not a minted badge.

The overriding path whitelist excludes root `DESIGN.md`; the requested content is delivered as [`docs/DESIGN.md`](DESIGN.md). `web/.gitignore` is the sole added dotfile, with an explicit 256-byte budget and 94 actual bytes. Build inputs are preserved under `web/config/`; removed task-input files are not required to rebuild.

## Build and export evidence

| Check | Actual result |
| --- | --- |
| `npm install --no-audit --no-fund --cache /tmp/badges-npm-cache` | Completed; exact package versions and npm lockfile delivered for subsequent `npm ci` |
| `npm run typecheck` (also inside build) | Passed, TypeScript strict checking of app and tests |
| `npm run build` | Passed after final source changes; Vite relative base and local assets |
| ABI verification | Both compiler-exported ABIs equal bytes at deployed commit `9f69f30234cc146f753eda9e3e96b649ae02b413`; both canonical Keccak hashes match the handoff |
| `npm run check:export` | Passed: exact handoff identity/contract set, original network block bytes, wallet-add object, pool, six asset hashes, ABI hashes, safe relative paths and size bounds |
| Export inventory | Six assets, 526,580 bytes excluding manifest; includes index.html, two ABI JSON files, CSS and both JavaScript chunks |
| `npm test` | **12 passed**, 18.3s; Chromium using the worker's installed headless executable |
| `npm run check:rpc` | All three supplied endpoints returned the specified chain, nonempty project code and expected contract reads |
| Submission size/scope audit | All delivered files are within allowed paths; no protected tracked file changed, dependency/cache artifact or submodule added. A conservative complete-bundle estimate is below 1.4 MB versus the 8 MiB limit; see `evidence/submission-budget.json`. Local Git commit remains unavailable as described below. |

Commands were run from `web/`. Browser command on this worker:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/imd1/.cache/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell npm test
```

An initial CSS import build error was removed. The accessibility tool initially resolved a newer incompatible Playwright core; `package.json` now pins its override to the test runner's 1.56.1 version, and the strict typecheck passes. These are repaired setup failures, not unperformed checks.

The raw Playwright result is [`evidence/interactions.json`](evidence/interactions.json); rendered measurements are [`evidence/design-checks.json`](evidence/design-checks.json). Screenshot fixtures are [`evidence/desktop.jpg`](evidence/desktop.jpg) (1440px) and [`evidence/mobile.jpg`](evidence/mobile.jpg) (390px). Their balances, badges and connected address are explicitly **mock fixtures**, not live user accounts. The browser tool additionally viewed the actual export with live RPC reads and no injected wallet at desktop/mobile widths, including 320px; final console errors/warnings were zero.

## Interaction coverage

The tests exercise the production HTML/JS through a subpath, decode real ABI call data, simulate JSON-RPC responses, and inspect wallet requests:

1. Signing rejection and reverted receipt never report success; receipt explorer link persists.
2. Insufficient balance disables approval; keyboard approval/create works; excessive swap input is refused before signing.
3. Missing wallet explains recovery; disconnected writes are disabled; public address profiles remain readable.
4. Wrong chain triggers 4902 → exact `wallet_addEthereumChain` parameters → switch again.
5. Rejected connection restores an actionable connection control.
6. Exact 100 BDGE approval precedes create; invalid name blocks submission; award, duplicate guard, cancel/confirm burn, handover and nonissuer gating work.
7. Native-input quote, integer slippage minimum, command/action/pool/settlement encoding, nonzero ETH value, simulation failure and 60-second quote expiry.
8. Token-input exact ERC-20 and Permit2 approvals target supplied addresses; router approval expires in one hour; token-input swap sends zero ETH value.
9. Account changes clear quotes/issuer authority; six-item profile/type pagination works; foreign profiles lack burn controls.
10. Altered ABI or empty deployed code fails closed; deployment retry recovers.
11. All-RPC outage displays failure, disables writes and recovers through refresh without signing.
12. Reflow at 1440/900/768/390/320px, zero axe WCAG A/AA findings at those widths, skip-link focus, 200% text enlargement, measured contrast and screenshots.

## Better Interface consolidated review

All six pinned domain core sections were read before implementation; the documentation method was read after corrections. Sources: `web/src/App.tsx`, `web/src/styles.css`, `web/src/chain.ts`, rendered production page, accessibility snapshots, browser screenshots and interaction tests.

| Domain | Coverage and evidence | Unperformed / not applicable |
| --- | --- | --- |
| Accessibility — Checked | Native controls, labels, landmarks, local announcements, skip link, keyboard create flow, 3px visible focus, explicit disabled reasons, axe at five widths. Browser tool visually inspected the skip-link ring and subsequent anchor focus. | No real screen-reader session or physical touch device. Native confirm dialogs tested through browser dialog accept/dismiss, not assistive technology. |
| Layout — Checked | Shared edges, distinct sections, address wrapping, full-page screenshots, five widths and 200% root-font reflow. Rotated illustration overflow fixed. | Native browser 200% zoom and RTL mirror unperformed. RTL/localization not part of this English-only page. |
| Writing — Checked | Verb-led controls, separate approve/create steps, explicit burn/handover consequences, actionable empty/error states, repeated test-toy disclaimer, corrected singular badge/type counts. | No localization/user comprehension study. |
| Typography — Checked | Descending semantic hierarchy, serif/sans roles, 16px inputs, 68ch measure, realistic addresses, tabular balances and long-name wrapping rules. | Exact platform font files and native-device rendering not verified. |
| Colors — Checked | Central semantic hex tokens; browser-computed text/background pairs recorded; body 14.34:1, muted panel 5.95:1, muted swap 5.07:1, wallet 14.34:1, burn 6.79:1. Axe found no contrast issues in inspected states. | No dark theme (not applicable). Not every possible focus/hover/background pair was individually measured. |
| UI — Checked | Native disclosure, disabled/loading/empty/selected/error/confirmed states, safe image context, consistent shapes, hover media guard, 120ms press transition gated off under reduced motion. | Animation-panel replay at 10% speed unperformed. No custom animated overlays or page entrances exist. |

### Findings, fixes and rechecks

| Severity / location | Reproduction and user impact | Correction and result |
| --- | --- | --- |
| High — `web/src/chain.ts:35` | A simulated router revert containing “rejected” became “Request declined in your wallet”, hiding the real contract failure. | Classify wallet rejection by error code/type through causes; preserve contract error text. Router-revert and signing-rejection browser tests now both pass. |
| Medium — `web/src/styles.css:982` | At 320px, the rotated hero orbit extended to x=320.75 and caused horizontal scrolling. | Reduce narrow orbit width to 230px; long text also wraps. Rechecked all five widths and 200% enlarged text: no overflow. |
| Medium — `web/src/App.tsx:613` | Fragment navigation needed an explicit focus target for a reliable keyboard skip path. | `main` has `tabIndex=-1`; automated focus assertion and visual browser inspection pass. |
| Medium — `web/src/styles.css:889` | Source review found mobile visual panel order differed from DOM/keyboard order. | Mobile now stacks create, swap, manage in DOM order. Rebuilt and reran the viewport/browser checks. |
| Medium — `web/src/chain.ts:164` | Source review found that a cancelled/replaced transaction's successful receipt could be mistaken for success of the original action. | Distinguish gas repricing from other replacements; preserve replacement hash and require checking the explorer. Source/typecheck reviewed; replacement/mining scenarios remain untested live. Reverted-receipt UI is browser tested. |
| Low — `web/index.html` | Browser requested a nonexistent favicon, producing a resource error. | Inline local SVG favicon; final browser console has zero errors/warnings. |

No unresolved implementation blocker was observed in the tested scope.

## Live observations and limits

[`evidence/rpc.json`](evidence/rpc.json) records all three configured public RPCs returning chain 11155111. LaunchToken runtime was 1,723 bytes and SoulboundBadges 9,231 bytes. Token metadata/supply, the immutable token address and 100 BDGE creation fee matched expected reads. At that observation there were zero types and zero live badges.

[`evidence/live-quotes.json`](evidence/live-quotes.json) records separate read-only quoter simulations through the configured quoter. 0.001 ETH quoted 49,627.085152468411915572 BDGE. A 100 BDGE → ETH quote reverted with selector `0x6190b2b0`. The cause was not established; the UI preserves the revert and prevents a swap without a usable quote. Quote values are point-in-time observations, not promised execution rates. These calls used `eth_call`; no wallet signed or broadcast a transaction.

Real wallet extension interoperability, funded approval/create/award/burn/handover, Universal Router execution/mining, transaction replacement/reorgs, all browser engines and physical devices remain untested. Mock tests verify frontend behavior, not independent contract correctness. Public RPC availability and pool liquidity can change. ABI hash/code-presence checks are binding checks, not a bytecode equivalence or attestation-signature proof. Publication checks and IPFS/ENS hosting have not run and are not claimed.

## Completion

Implementation, static export and worker validation are complete, with the explicit path conflict resolved in favor of `docs/DESIGN.md` and live-chain limitations recorded above. Source, lockfile, relative static export, runtime manifest and validation evidence are present together. No deployment or publication was performed.

**Local commit unavailable:** `git add -- web dist docs` failed with `Unable to create .git/index.lock: Read-only file system`. The checkout's Git metadata is protected. No local commit was created; the submission/publisher must snapshot the delivered files. This is an environment restriction, not a claimed successful commit.
