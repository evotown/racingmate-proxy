const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 8080;

// Betfair credentials (optional but needed for live prices)
const BETFAIR_APP_KEY = process.env.BETFAIR_APP_KEY || "";
const BETFAIR_SESSION = process.env.BETFAIR_SESSION || "";

// Health check
app.get("/health", (_, res) => res.json({ ok: true }));

// Meetings endpoint
app.get("/meetings", (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date=YYYY-MM-DD required" });

  try {
    const raw = fs.readFileSync("./form_today.json", "utf8");
    const data = JSON.parse(raw);
    const meetings = (data.meetings || []).filter(m => m.date === date);
    res.json(meetings);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Race details endpoint
app.get("/races/:raceId", (req, res) => {
  try {
    const raw = fs.readFileSync("./form_today.json", "utf8");
    const data = JSON.parse(raw);
    for (const m of data.meetings || []) {
      const r = (m.races || []).find(x => String(x.raceId) === req.params.raceId);
      if (r) return res.json(r);
    }
    res.status(404).json({ error: "race not found" });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Live odds endpoint
app.get("/odds/:marketId", async (req, res) => {
  try {
    const { marketId } = req.params;
    if (!BETFAIR_APP_KEY || !BETFAIR_SESSION) {
      return res.json({ marketId, collectedAt: new Date().toISOString(), prices: [] });
    }

    const resp = await axios.post(
      "https://api.betfair.com/exchange/betting/rest/v1.0/listMarketBook/",
      [{ marketId, priceProjection: { priceData: ["EX_BEST_OFFERS", "EX_TRADED"] } }],
      {
        headers: {
          "X-Application": BETFAIR_APP_KEY,
          "X-Authentication": BETFAIR_SESSION,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    const book = resp.data?.[0] || {};
    const prices = (book.runners || []).map(r => {
      const bestBack = r.ex?.availableToBack?.[0]?.price ?? null;
      const last = r.lastPriceTraded ?? null;
      return {
        selectionId: String(r.selectionId),
        lastPriceTraded: last,
        bestBack,
        bestLay: r.ex?.availableToLay?.[0]?.price ?? null,
        probabilityImplied: bestBack ? 1 / bestBack : (last ? 1 / last : null),
        bookmaker: "Betfair"
      };
    });

    res.json({ marketId, collectedAt: new Date().toISOString(), prices });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.listen(PORT, () => console.log(`RacingMate proxy listening on :${PORT}`));
