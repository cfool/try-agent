import "dotenv/config";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { startApp } from "./tui/index.js";

const argv = await yargs(hideBin(process.argv))
  .usage("Usage: $0 [options]")
  .option("model", {
    alias: "m",
    type: "string",
    describe: "Model to use (overrides MODEL env var)",
  })
  .help()
  .alias("h", "help")
  .parse();

await startApp({
  model: argv.model,
});
