# Badges frontend

One static React + TypeScript page for the deployed SoulboundBadges application. **Sepolia test toy: badges are not credentials.** The source and dependency lockfile live here; the production site is provided at [`../dist/`](../dist/) for submission. No server, indexer, account database, wallet key, or private RPC credential is needed. The worker checkout's Git metadata is read-only, so local commit creation was unavailable; see the validation report.

## Install, build and preview

Use Node 22.12+ or Node 24 and npm. From the repository root:

```sh
cd web
npm ci
npm run typecheck
npm run build
npm run check:export
node scripts/serve.mjs
```

Open `http://localhost:4173/preview/`. Stop the preview with Ctrl+C. This preview deliberately serves the actual export under a subpath. `npm run preview` also serves the export through Vite. After changing source, rebuild before previewing. Vite uses `base: './'`; navigation uses page anchors. Upload the **entire** `dist/` directory as plain files. Do not host `web/` or depend on a development server.

`build` verifies the implementation ABI files against Git commit `9f69f30234cc146f753eda9e3e96b649ae02b413`, typechecks, exports Vite assets, copies the verified ABI bytes, and emits `dist/imd-deployment.json` last. The pinned commit must exist in the local Git object database (avoid a shallow checkout that omits it). There is no dependency on `.imd/reads/` at build time.

## Deployment configuration

`config/deployment.json` and `config/network.json` preserve the supplied build inputs. **At runtime the only deployment configuration is `dist/imd-deployment.json`.** `src/config.ts` fetches that file relative to the current page, loads each referenced ABI JSON, verifies its canonical Keccak hash, and creates clients from the same network object. It contains no second address map. Public RPC URLs, chain metadata, wallet-add parameters and Uniswap addresses all come from the manifest.

The build reads compiler-generated ABIs from `docs/abi/<Contract>.json` at the deployed source commit and checks them against the handoff. Contracts are unchanged. Canonical hashing recursively sorts object keys, preserves array order, serializes without whitespace and computes Keccak-256 over UTF-8 JSON. Hash fields exclude `0x`. The export checker checks the exact contract set, handoff identity, original network JSON block bytes, pool, ABI hashes and all SHA-256 asset hashes. The asset list excludes its own manifest.

The manifest also carries `pool` and the exact `walletAddChain` object. The native ETH pool is hookless, as specified in the supplied deployment. Quoter, router and Permit2 function interfaces are centralized in `src/chain.ts`; those are protocol interfaces, not replacements for the implementation-derived project ABIs. The quote interface follows [Uniswap's IV4Quoter](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IV4Quoter.sol). Router command and action encoding follows this assignment's specified deployed interface; it must not be silently migrated to an unrelated current router interface.

## Wallet and contract flows

- Injected browser wallets support EIP-1193 and EIP-6963 discovery. No WalletConnect project ID was supplied; WalletConnect is not configured. Public reads use the supplied RPC URLs in order with fallback. Signing always uses the selected wallet.
- The page displays the connected address, BDGE balance, badge creation allowance, network, loading/error states and transaction explorer links. Balances refresh on connection, account/network changes, confirmed transactions and manual refresh. Pending/rejected/reverted transactions have distinct messages.
- A missing chain triggers switch → add the supplied chain → switch again. A wrong network, unverified deployment, unavailable RPC, missing allowance, insufficient balance or missing issuer authority disables the relevant write control. Account and chain are checked again before signing. RPC chain ID, nonempty project code and the immutable fee-token binding are verified before writes.
- Creating a type first requires an explicit **100 BDGE approval** to SoulboundBadges, then a separate `createBadgeType`. Names follow the contract's 1–32 ASCII character rule. The fee transfers directly to the dead address; it is not held by the application.
- A loaded type shows its name, ID and current issuer. Only the current issuer can award or hand over it. A duplicate live award is detected using `badgeOf`; simulation rechecks contract eligibility. Handover asks for confirmation and explains the immediate loss of issuer control.
- Any address's profile loads enumeration views and on-chain metadata, six badges per page. Badge types also paginate six at a time. No backend or indexer is used. SVGs are rendered as images, never inserted as page HTML. Only a connected holder sees a burn control, with an explicit confirmation. Badge ERC-721 transfers and approvals are intentionally absent because they revert by design.
- ETH → BDGE needs no token approval. BDGE → ETH has two separate steps: ERC-20 approval to Permit2 and Permit2 approval to the supplied Universal Router, each for the chosen amount; router permission expires in one hour. A fresh quote is required after each approval. Slippage is selectable from 0.01% to 5%; displayed output minimum uses integer arithmetic. Quotes expire after 60 seconds. The router deadline is two minutes. Input balances are checked; gas remains the wallet's responsibility.
- Quotes use `simulateContract(quoteExactInputSingle)`. Swaps use `execute` with command `0x10`, actions `0x060c0f`, and the handoff pool parameters. Every write is simulated before requesting a signature. Failed simulation prevents wallet signing. Cancelled/replaced original transactions are not reported as a confirmed application action; a gas repricing can still confirm normally.

## Validation

```sh
# Install a browser into a temporary cache, outside delivered files:
PLAYWRIGHT_BROWSERS_PATH=/tmp/badges-browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/badges-browsers npm test
npm run check:rpc
```

Alternatively set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing Chromium executable. Playwright starts the static subpath preview if necessary. Tests use a mocked injected wallet and intercepted RPC responses; no wallet key or real transaction is involved. They exercise the exported app, not Vite's development mode. Test evidence goes to `docs/evidence/`; scratch reports remain ignored in `web/test-results/`.

See [`docs/VALIDATION.md`](../docs/VALIDATION.md) for actual worker results and limitations, [`docs/DESIGN.md`](../docs/DESIGN.md) for final design tokens and behavior, and [`docs/evidence/`](../docs/evidence/) for screenshots and machine-readable evidence. Live RPC/code reads passed on all supplied endpoints. An ETH → BDGE live quote succeeded; a BDGE → ETH quote reverted at the observed pool state. Real wallet signing, mining, approvals and swaps were not performed.

## Scope and packaging

The overriding path rules permit only `web/**`, `dist/**`, `docs/**` and the explicit `web/.gitignore` exception. The requested root `DESIGN.md` therefore lives at `docs/DESIGN.md`; no protected root file was changed. The explicit ignore-file path budget is **256 bytes for `web/.gitignore`** (actual 94 bytes). Its recursive patterns exclude dependencies, caches, Vite cache, test output and TypeScript incremental files at every nesting level under `web/`. No vendored registry, tarballs, submodules, source maps or remote font assets are delivered. The static export is about 0.51 MiB including its manifest, well within the asset and response budgets. Publication, IPFS pinning, naming and public URLs are handled after source delivery.
