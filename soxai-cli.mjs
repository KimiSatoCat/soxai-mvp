#!/usr/bin/env node
import fs from "fs";
import path from "path";

const PROXY = process.env.SOXAI_PROXY || "http://localhost:3001";
const EMAIL = process.env.SOXAI_EMAIL || "";
const PASSWORD = process.env.SOXAI_PASSWORD || "";

function nowStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { rawText: text };
  }

  return {
    ok: res.ok,
    status: res.status,
    json,
  };
}

async function login() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("SOXAI_EMAIL / SOXAI_PASSWORD が未設定です。");
  }

  const result = await postJson(`${PROXY}/api/login`, {
    email: EMAIL,
    password: PASSWORD,
  });

  if (!result.ok || !result.json?.success) {
    throw new Error(
      `ログイン失敗: HTTP ${result.status} / ${JSON.stringify(result.json, null, 2)}`
    );
  }

  return {
    idToken: result.json.idToken,
    localId: result.json.localId,
    raw: result.json,
  };
}

async function fetchBoth(idToken, localId) {
  const result = await postJson(`${PROXY}/api/fetch-data`, {
    idToken,
    localId,
    dataType: "both",
  });

  if (!result.ok) {
    throw new Error(
      `fetch-data 失敗: HTTP ${result.status} / ${JSON.stringify(result.json, null, 2)}`
    );
  }

  return result.json;
}

function saveJsonFile(obj, prefix = "soxai-raw") {
  ensureDir("exports");
  const file = path.join("exports", `${prefix}-${nowStamp()}.json`);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
  console.log(`保存完了: ${file}`);
  return file;
}

function flattenObject(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flattenObject(v, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

function arrayToCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";

  const flatRows = rows.map((r) => flattenObject(r));
  const headers = Array.from(
    flatRows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set())
  );

  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  return [
    headers.join(","),
    ...flatRows.map((row) => headers.map((h) => esc(row[h])).join(",")),
  ].join("\n");
}

function saveCsvFiles(fetchRes) {
  ensureDir("exports");
  const stamp = nowStamp();

  const infoRows = Array.isArray(fetchRes?.results?.dailyInfo?.data)
    ? fetchRes.results.dailyInfo.data
    : [];

  const detailRows = Array.isArray(fetchRes?.results?.dailyDetail?.data)
    ? fetchRes.results.dailyDetail.data
    : [];

  const infoFile = path.join("exports", `dailyInfo-${stamp}.csv`);
  const detailFile = path.join("exports", `dailyDetail-${stamp}.csv`);

  fs.writeFileSync(infoFile, "\uFEFF" + arrayToCsv(infoRows), "utf8");
  fs.writeFileSync(detailFile, "\uFEFF" + arrayToCsv(detailRows), "utf8");

  console.log(`保存完了: ${infoFile}`);
  console.log(`保存完了: ${detailFile}`);

  return { infoFile, detailFile };
}

function getRows(fetchRes, kind) {
  if (kind === "info") {
    return Array.isArray(fetchRes?.results?.dailyInfo?.data)
      ? fetchRes.results.dailyInfo.data
      : [];
  }
  if (kind === "detail") {
    return Array.isArray(fetchRes?.results?.dailyDetail?.data)
      ? fetchRes.results.dailyDetail.data
      : [];
  }
  return [];
}

function summarizeFields(rows) {
  const fieldMap = new Map();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const [k, v] of Object.entries(row)) {
      if (!fieldMap.has(k)) {
        fieldMap.set(k, {
          field: k,
          count: 0,
          nonNull: 0,
          sample: null,
          types: new Set(),
        });
      }
      const rec = fieldMap.get(k);
      rec.count += 1;
      if (v !== null && v !== undefined && v !== "") {
        rec.nonNull += 1;
        if (rec.sample == null) rec.sample = v;
      }
      rec.types.add(v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
    }
  }

  return Array.from(fieldMap.values())
    .map((x) => ({
      field: x.field,
      count: x.count,
      nonNull: x.nonNull,
      nullRate: x.count > 0 ? Math.round(((x.count - x.nonNull) / x.count) * 1000) / 10 : null,
      sample: x.sample,
      types: Array.from(x.types).sort(),
    }))
    .sort((a, b) => a.field.localeCompare(b.field));
}

function inspectSleepFields(rows) {
  const keywords = [
    "sleep",
    "deep",
    "light",
    "rem",
    "stage",
    "bed",
    "wake",
    "efficiency",
    "awake",
    "waso",
    "hr",
    "hrv",
    "stress",
  ];

  return summarizeFields(rows).filter((x) =>
    keywords.some((kw) => x.field.toLowerCase().includes(kw))
  );
}

function printTable(items) {
  if (!items.length) {
    console.log("該当項目なし");
    return;
  }
  console.table(
    items.map((x) => ({
      field: x.field,
      nonNull: x.nonNull,
      count: x.count,
      nullRate: x.nullRate,
      types: x.types.join("|"),
      sample:
        typeof x.sample === "object" ? JSON.stringify(x.sample).slice(0, 80) : String(x.sample).slice(0, 80),
    }))
  );
}

async function runLoginOnly() {
  const auth = await login();
  ensureDir("exports");
  const file = path.join("exports", `login-${nowStamp()}.json`);
  fs.writeFileSync(file, JSON.stringify(auth.raw, null, 2), "utf8");
  console.log("ログイン成功");
  console.log(`idToken: ${auth.idToken.slice(0, 20)}...`);
  console.log(`localId: ${auth.localId}`);
  console.log(`保存完了: ${file}`);
}

async function runExportJson() {
  const auth = await login();
  const fetchRes = await fetchBoth(auth.idToken, auth.localId);
  saveJsonFile(fetchRes, "soxai-fetch");
}

async function runExportCsv() {
  const auth = await login();
  const fetchRes = await fetchBoth(auth.idToken, auth.localId);
  saveCsvFiles(fetchRes);
}

async function runInspect(kind = "detail") {
  const auth = await login();
  const fetchRes = await fetchBoth(auth.idToken, auth.localId);
  const rows = getRows(fetchRes, kind);

  console.log(`${kind} rows: ${rows.length}`);
  const sleepFields = inspectSleepFields(rows);
  printTable(sleepFields);

  ensureDir("exports");
  const file = path.join("exports", `${kind}-sleep-fields-${nowStamp()}.json`);
  fs.writeFileSync(file, JSON.stringify(sleepFields, null, 2), "utf8");
  console.log(`保存完了: ${file}`);
}

async function runFieldSummary(kind = "detail") {
  const auth = await login();
  const fetchRes = await fetchBoth(auth.idToken, auth.localId);
  const rows = getRows(fetchRes, kind);

  console.log(`${kind} rows: ${rows.length}`);
  const summary = summarizeFields(rows);
  printTable(summary);

  ensureDir("exports");
  const file = path.join("exports", `${kind}-all-fields-${nowStamp()}.json`);
  fs.writeFileSync(file, JSON.stringify(summary, null, 2), "utf8");
  console.log(`保存完了: ${file}`);
}

async function main() {
  const cmd = process.argv[2];

  switch (cmd) {
    case "login":
      await runLoginOnly();
      break;
    case "export-json":
      await runExportJson();
      break;
    case "export-csv":
      await runExportCsv();
      break;
    case "inspect-info":
      await runInspect("info");
      break;
    case "inspect-detail":
      await runInspect("detail");
      break;
    case "fields-info":
      await runFieldSummary("info");
      break;
    case "fields-detail":
      await runFieldSummary("detail");
      break;
    default:
      console.log(`
使い方:
  node soxai-cli.mjs login
  node soxai-cli.mjs export-json
  node soxai-cli.mjs export-csv
  node soxai-cli.mjs inspect-info
  node soxai-cli.mjs inspect-detail
  node soxai-cli.mjs fields-info
  node soxai-cli.mjs fields-detail

必要な環境変数:
  SOXAI_EMAIL
  SOXAI_PASSWORD
  SOXAI_PROXY   (省略時 http://localhost:3001)
      `.trim());
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
