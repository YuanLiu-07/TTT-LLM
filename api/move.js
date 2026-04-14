/**
 * Vercel Serverless：把棋盘发给 OpenAI 兼容接口，返回 O 的落子位置。
 * 环境变量：OPENAI_API_KEY（必填）
 * 可选：OPENAI_BASE_URL（默认 https://api.openai.com/v1）
 * 可选：OPENAI_MODEL（默认 gpt-4o-mini）
 */

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseBoard(body) {
  const board = body?.board;
  if (!Array.isArray(board) || board.length !== 9) {
    return { error: "board 必须是长度为 9 的数组" };
  }
  for (const c of board) {
    if (c !== null && c !== "X" && c !== "O") {
      return { error: "棋盘格子只能是 null、X 或 O" };
    }
  }
  const x = board.filter((c) => c === "X").length;
  const o = board.filter((c) => c === "O").length;
  if (x !== o + 1) {
    return { error: "当前不是轮到 O：应为 X 比 O 多 1 子" };
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
    res.status(405).json({ error: "仅支持 POST" });
    return;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    res.status(500).json({
      error: "服务器未配置 OPENAI_API_KEY。在 Vercel 项目 Environment Variables 中添加。",
    });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: "JSON 解析失败" });
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
    res.status(400).json({ error: "棋盘已满" });
    return;
  }

  const base =
    process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
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

  const system = `你是井字棋玩家，执 O。棋盘索引 0-8 从左到右、从上到下。
仅输出一个 JSON 对象，不要 markdown，不要其它文字：{"position": <0到8的整数>}
必须选择当前为空的格子。`;

  const user = `当前棋盘（行格式）：
${visual}

可下位置：${empties.join(", ")}
请下 O。`;

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
      res.status(502).json({ error: `模型接口错误：${msg}` });
      return;
    }

    const text = data?.choices?.[0]?.message?.content ?? "";
    let pos = extractPosition(text);

    if (pos === null || board[pos] !== null) {
      res.status(502).json({
        error: "模型返回无效落子，请重试",
        raw: text,
      });
      return;
    }

    res.status(200).json({ position: pos });
  } catch (e) {
    res.status(500).json({ error: e.message || "请求失败" });
  }
};
