import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const envPath = new URL("../.env", import.meta.url);
let contents = await readFile(envPath, "utf8");

function replace(key, value) {
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  contents = pattern.test(contents) ? contents.replace(pattern, line) : `${contents.trimEnd()}\n${line}\n`;
}

function token(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

replace("P01_BOOTSTRAP_STAFF_USERNAME", `staff-${token(6).toLowerCase()}`);
replace("P01_BOOTSTRAP_STAFF_PASSWORD", `Ls1!${token(28)}`);
replace("P01_BOOTSTRAP_PHYSICIAN_USERNAME", `physician-${token(6).toLowerCase()}`);
replace("P01_BOOTSTRAP_PHYSICIAN_PASSWORD", `Lp1!${token(28)}`);
replace("P01_LOCAL_STAFF_DEVICE_KEY", token(32));

await writeFile(envPath, contents, { mode: 0o600 });
console.log("Rotated local development bootstrap credentials in .env; secret values were not printed.");
