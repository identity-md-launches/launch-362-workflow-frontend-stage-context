import {
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { handoff, net, abis } from "./verify.mjs";
const root = new URL("../../dist/", import.meta.url);
mkdirSync(new URL("abi/", root), { recursive: true });
for (const [name, bytes] of abis)
  writeFileSync(new URL(`abi/${name}.json`, root), bytes);
function walk(dir = "") {
  return readdirSync(new URL(dir, root))
    .sort()
    .flatMap((name) => {
      const path = dir + name;
      return statSync(new URL(path, root)).isDirectory()
        ? walk(path + "/")
        : path === "imd-deployment.json"
          ? []
          : [path];
    });
}
const assets = walk().map((path) => ({
  path,
  sha256: createHash("sha256")
    .update(readFileSync(new URL(path, root)))
    .digest("hex"),
}));
const { launchId, chainId, sourceCommit, attestationHash } = handoff;
const manifest = {
  version: 1,
  launchId,
  chainId,
  sourceCommit,
  attestationHash,
  contracts: handoff.contracts.map(({ name, address, abiHash }) => ({
    name,
    address,
    abiHash,
    abiPath: `abi/${name}.json`,
  })),
  assets,
  network: net.network,
  walletAddChain: net.walletAddChain,
  pool: handoff.manifest.pool,
};
// Preserve the network object's original JSON bytes, including formatting.
const rawNetwork = readFileSync(
  new URL("../config/network.json", import.meta.url),
  "utf8",
);
const start = rawNetwork.indexOf("{", rawNetwork.indexOf('"network"'));
// Locate by parsing the known top-level block boundary, avoiding object reformatting.
const rawBlock = rawNetwork
  .slice(start, rawNetwork.lastIndexOf(',\n  "walletAddChain"'))
  .trimEnd();
let output = JSON.stringify(
  { ...manifest, network: "__NETWORK_BLOCK__" },
  null,
  2,
).replace('"__NETWORK_BLOCK__"', rawBlock);
JSON.parse(output);
writeFileSync(new URL("imd-deployment.json", root), output + "\n");
console.log(`Exported runtime manifest and ${assets.length} asset hashes`);
