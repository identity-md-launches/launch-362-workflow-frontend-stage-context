import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { handoff, net, canonical } from "./verify.mjs";
import { keccak256, toHex } from "viem";
const root = new URL("../../dist/", import.meta.url);
const m = JSON.parse(readFileSync(new URL("imd-deployment.json", root)));
const originalNetwork = readFileSync(
  new URL("../config/network.json", import.meta.url),
  "utf8",
);
const rawBlock = originalNetwork
  .slice(
    originalNetwork.indexOf("{", originalNetwork.indexOf('"network"')),
    originalNetwork.lastIndexOf(',\n  "walletAddChain"'),
  )
  .trimEnd();
assert(
  readFileSync(new URL("imd-deployment.json", root), "utf8").includes(
    '"network": ' + rawBlock,
  ),
);
for (const k of ["launchId", "chainId", "sourceCommit", "attestationHash"])
  assert.deepEqual(m[k], handoff[k]);
assert.deepEqual(m.network, net.network);
assert.deepEqual(m.walletAddChain, net.walletAddChain);
assert.deepEqual(m.pool, handoff.manifest.pool);
assert.deepEqual(
  m.contracts.map(({ abiPath, ...c }) => c),
  handoff.contracts.map(({ name, address, abiHash }) => ({
    name,
    address,
    abiHash,
  })),
);
const walk = (dir = "") =>
  readdirSync(new URL(dir, root)).flatMap((n) =>
    statSync(new URL(dir + n, root)).isDirectory()
      ? walk(dir + n + "/")
      : [dir + n],
  );
assert.deepEqual(
  m.assets.map((a) => a.path).sort(),
  walk()
    .filter((p) => p !== "imd-deployment.json")
    .sort(),
);
assert(m.assets.length <= 128);
let total = 0;
for (const a of m.assets) {
  assert(
    !a.path.startsWith("/") && !a.path.includes("..") && !a.path.includes(":"),
  );
  const b = readFileSync(new URL(a.path, root));
  total += b.length;
  assert(b.length <= 8388608);
  assert.match(a.sha256, /^[a-f0-9]{64}$/);
  assert.equal(createHash("sha256").update(b).digest("hex"), a.sha256);
}
for (const c of m.contracts)
  assert.equal(
    keccak256(
      toHex(canonical(JSON.parse(readFileSync(new URL(c.abiPath, root))))),
    ).slice(2),
    c.abiHash,
  );
assert(total < 8388608);
console.log(
  `PASS: exact handoff, network, pool, ABI binding, ${m.assets.length} assets, ${total} bytes`,
);
