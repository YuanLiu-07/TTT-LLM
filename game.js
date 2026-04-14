const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("reset");
const errorEl = document.getElementById("error");

/** @type {(null|'X'|'O')[]} */
let board = Array(9).fill(null);
let locked = false;

function line(a, b, c) {
  if (board[a] && board[a] === board[b] && board[b] === board[c]) {
    return board[a];
  }
  return null;
}

function winner() {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    const w = line(a, b, c);
    if (w) return w;
  }
  return null;
}

function full() {
  return board.every((c) => c !== null);
}

function setError(msg) {
  if (!msg) {
    errorEl.hidden = true;
    errorEl.textContent = "";
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = msg;
}

function render() {
  boardEl.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cell";
    btn.dataset.index = String(i);
    const v = board[i];
    if (v === "X") {
      btn.textContent = "X";
      btn.classList.add("x");
      btn.disabled = true;
    } else if (v === "O") {
      btn.textContent = "O";
      btn.classList.add("o");
      btn.disabled = true;
    } else {
      btn.textContent = "";
      btn.disabled = locked || winner() || full();
    }
    btn.addEventListener("click", () => onCell(i));
    boardEl.appendChild(btn);
  }
}

function updateStatus() {
  const w = winner();
  if (w === "X") {
    statusEl.textContent = "你赢了！";
    locked = true;
  } else if (w === "O") {
    statusEl.textContent = "AI（O）赢了";
    locked = true;
  } else if (full()) {
    statusEl.textContent = "平局";
    locked = true;
  } else {
    const xCount = board.filter((c) => c === "X").length;
    const oCount = board.filter((c) => c === "O").length;
    if (xCount === oCount) {
      statusEl.textContent = "轮到你（X）";
    } else {
      statusEl.textContent = "AI 思考中…";
    }
  }
}

async function fetchAiMove() {
  const apiBase =
    typeof window.__API_BASE__ === "string" ? window.__API_BASE__ : "";
  const url = `${apiBase}/api/move`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ board }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  if (typeof data.position !== "number") {
    throw new Error("服务器返回格式错误");
  }
  return data.position;
}

async function onCell(i) {
  if (locked || board[i] !== null) return;
  const xCount = board.filter((c) => c === "X").length;
  const oCount = board.filter((c) => c === "O").length;
  if (xCount !== oCount) return;

  board[i] = "X";
  setError("");
  render();
  updateStatus();

  if (winner() || full()) {
    render();
    return;
  }

  locked = true;
  render();
  updateStatus();

  try {
    const pos = await fetchAiMove();
    if (board[pos] !== null) {
      throw new Error("AI 落在已有格子上");
    }
    board[pos] = "O";
  } catch (e) {
    setError(e.message || String(e));
    board[i] = null;
    locked = false;
    render();
    updateStatus();
    return;
  }

  locked = false;
  render();
  updateStatus();
}

function reset() {
  board = Array(9).fill(null);
  locked = false;
  setError("");
  render();
  updateStatus();
}

resetBtn.addEventListener("click", reset);

reset();
