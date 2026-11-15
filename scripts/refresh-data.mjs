import { readFileSync, writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const configContext = { window: {} };
runInNewContext(readFileSync(new URL("../data.js", import.meta.url), "utf8"), configContext);
const config = configContext.window.LEAGUE;
const eventName = process.env.GITHUB_EVENT_NAME || "";

if (eventName === "schedule") {
  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date());
  const [hour, minute] = localTime.split(":").map(Number);
  if (hour !== 20 || minute < 15) {
    console.log(`No corresponde al refresco de las 20:15 de Madrid (hora local ${localTime}); no se modifica la copia.`);
    process.exit(0);
  }
}

const groups = [...new Set(config.teams.map((team) => String(team.groupId || "").trim()).filter(Boolean))];
const recordsByGroup = {};
const resource = config.openData.matchesResource;
const api = config.openData.api;
const pageSize = Math.min(1000, Math.max(100, Number(config.openData.pageSize) || 1000));

async function fetchPage(groupId, offset) {
  const url = new URL(api);
  url.searchParams.set("resource_id", resource);
  url.searchParams.set("filters", JSON.stringify({ Codigo_grupo: groupId }));
  url.searchParams.set("limit", String(pageSize));
  url.searchParams.set("offset", String(offset));
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Open Data respondió ${response.status} para el grupo ${groupId}.`);
  const payload = await response.json();
  if (!payload.success) throw new Error(`CKAN no pudo consultar el grupo ${groupId}.`);
  return payload.result;
}

for (const groupId of groups) {
  let offset = 0;
  let total = 0;
  const rows = [];
  do {
    const result = await fetchPage(groupId, offset);
    rows.push(...(result.records || []));
    total = Number(result.total) || rows.length;
    offset += pageSize;
  } while (offset < total && offset < 10000);
  rows.sort((a, b) => Number(a.Jornada) - Number(b.Jornada) || String(a.Fecha || "").localeCompare(String(b.Fecha || "")) || Number(a.Partido) - Number(b.Partido));
  if (!rows.length) throw new Error(`Open Data no devolvió partidos para el grupo ${groupId}; se conserva la copia anterior.`);
  recordsByGroup[groupId] = rows;
  console.log(`Grupo ${groupId}: ${rows.length} partidos descargados.`);
}

const snapshot = {
  source: "Open Data Ayuntamiento de Madrid",
  resource,
  fetchedAt: new Date().toISOString(),
  groups: recordsByGroup
};
writeFileSync(new URL("../matches.json", import.meta.url), `${JSON.stringify(snapshot)}\n`, "utf8");
console.log(`Copia guardada: ${groups.length} grupos; ${Object.values(recordsByGroup).reduce((sum, rows) => sum + rows.length, 0)} partidos.`);
