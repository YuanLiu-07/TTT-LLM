function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseBoard(body) {
  const board = body?.board;
  if (!Array.isArray(board) || board.length !== 9) {
    return { error: "board must be an array of length 9" };
  }
  for (const c of board) {
    if (c !== null && c !== "X" && c !== "O") {
      return { error: "cells must be null, X, or O" };
    }
  }
  const x = board.filter((c) => c === "X").length;
  const o = board.filter((c) => c === "O").length;
  if (x !== o + 1) {
    return { error: "invalid turn: X must have exactly one more move than O" };
  }
  return { board };
}

function extractPosition(text) {
  const trimmed = text.trim();
  let obj;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (m) obj = JSON.parse(m[0]);
  }
  if (!obj || typeof obj.position !== "number") return null;
  const p = obj.position;
  if (!Number.isInteger(p) || p < 0 || p > 8) return null;
  return p;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    res.status(500).json({
      error:
        "OPENAI_API_KEY is not set. Add it in Vercel project environment variables.",
    });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: "invalid JSON body" });
      return;
    }
  }

  const parsed = parseBoard(body);
  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { board } = parsed;
  const empties = board
    .map((c, i) => (c === null ? i : null))
    .filter((i) => i !== null);
  if (empties.length === 0) {
    res.status(400).json({ error: "board is full" });
    return;
  }

  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const visual = [0, 1, 2]
    .map((r) =>
      [0, 1, 2]
        .map((c) => {
          const i = r * 3 + c;
          const v = board[i];
          if (v === null) return String(i);
          return v;
        })
        .join("|")
    )
    .join("\n");

  const system = `You play tic-tac-toe as O. Board cells are indexed 0-8 from top-left to bottom-right, row by row.
Reply with one JSON object only, no markdown, no other text: {"position": <integer 0-8>}
You must choose an empty cell.`;

  const user = `Board (rows):
${visual}

Empty indices: ${empties.join(", ")}
Play O.`;

  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = data?.error?.message || JSON.stringify(data);
      res.status(502).json({ error: `model API error: ${msg}` });
      return;
    }

    const text = data?.choices?.[0]?.message?.content ?? "";
    let pos = extractPosition(text);

    if (pos === null || board[pos] !== null) {
      res.status(502).json({
        error: "invalid move from model",
        raw: text,
      });
      return;
    }

    res.status(200).json({ position: pos });
  } catch (e) {
    res.status(500).json({ error: e.message || "request failed" });
  }
};
