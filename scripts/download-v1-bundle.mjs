import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const outJs = path.join(process.env.TEMP || "/tmp", "radar.js");
const base = "https://radarimprensanordeste.manus.space";

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(new URL(res.headers.location, url).href).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

const html = await get(base + "/");
const m = html.match(/\/assets\/index-[^"]+\.js/);
if (!m) {
  console.error("Bundle script not found in HTML");
  process.exit(1);
}
const assetUrl = base + m[0];
console.log("Downloading", assetUrl);
const js = await get(assetUrl);
fs.writeFileSync(outJs, js);
console.log("Wrote", outJs, js.length);
