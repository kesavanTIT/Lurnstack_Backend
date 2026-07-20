const fs = require("fs");
const readline = require("readline");

const logPath = "C:\\Users\\DELL\\.gemini\\antigravity-ide\\brain\\af1cd50d-c344-42c9-9f1b-cb752bbcb148\\.system_generated\\logs\\transcript.jsonl";

async function main() {
  if (!fs.existsSync(logPath)) {
    console.log("Log file not found at " + logPath);
    return;
  }

  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log("Searching for command runs and PM2 references in log...");
  let count = 0;
  for await (const line of rl) {
    if (line.includes("pm2") || line.includes("kill") || line.includes("nodemon") || line.includes("restart")) {
      console.log(`--- Match ${++count} ---`);
      console.log(line.slice(0, 1000)); // Print first 1000 chars of the matching log line
    }
  }
}

main().catch(console.error);
