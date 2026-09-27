import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve(import.meta.dirname, "../../dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/preview/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const path = resolve(
      root,
      decodeURIComponent(url.pathname.slice("/preview/".length)) ||
        "index.html",
    );
    if (!path.startsWith(root + "/")) throw Error("Invalid path");
    res.setHeader(
      "Content-Type",
      types[extname(path)] || "application/octet-stream",
    );
    res.setHeader("Cache-Control", "no-store");
    res.end(await readFile(path));
  } catch {
    res.writeHead(404);
    res.end("File not found");
  }
}).listen(4173, "0.0.0.0", () =>
  console.log("Static export preview: http://localhost:4173/preview/"),
);
