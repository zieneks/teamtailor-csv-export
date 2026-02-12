const express = require("express");
const path = require("path");
const tt = require("./teamtailor");
const fs = require("fs");

// Calculate project root (since __filename is in dist/, go up one level)
const currentDir = path.dirname(path.resolve(__filename));
const projectRoot = path.dirname(currentDir);

// Load .env manually
try {
  const envContent = fs.readFileSync(path.join(projectRoot, ".env"), "utf-8");
  envContent.split("\n").forEach((line: string) => {
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) return;
    const key = line.slice(0, eqIndex).trim();
    const val = line.slice(eqIndex + 1).trim();
    if (key && !key.startsWith("#")) {
      process.env[key] = val;
    }
  });
} catch (e) {
}

const PORT: string | number = process.env.PORT || 3000;
const API_KEY: string | undefined = process.env.TEAMTAILOR_API_KEY;

const app = express();

app.use(express.static(path.join(projectRoot, "public")));

// Export endpoint
app.get("/api/export", async (req: any, res: any): Promise<void> => {
  const apiKey: string | undefined = req.headers["x-api-key"] as string | undefined || API_KEY;

  if (!apiKey || apiKey === "your_api_key_here") {
    res.status(400).json({
      error: "Missing API key. Set TEAMTAILOR_API_KEY in .env or send x-api-key header."
    });
    return;
  }

  try {
    console.log("[Export] Fetching candidates...");
    const rows = await tt.fetchAllCandidates(apiKey);
    console.log(`[Export] Got ${rows.length} rows. Generating CSV...`);

    const csv = tt.convertToCSV(rows);
    const today = new Date().toISOString().slice(0, 10);
    const filename = `teamtailor-candidates-${today}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);

    console.log(`[Export] CSV sent: ${filename}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[Export] Error:", errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

const server = app.listen(PORT, () => {
  console.log("");
  console.log("  Teamtailor CSV Exporter is running!");
  console.log(`  http://localhost:${PORT}`);
  console.log("");
  if (!API_KEY || API_KEY === "your_api_key_here") {
    console.log("  WARNING: No TEAMTAILOR_API_KEY in .env");
    console.log("  You can enter the key on the web page");
    console.log("");
  }
});

module.exports = server;
