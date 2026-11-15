(() => {
  const config = window.LEAGUE;
  const $ = (selector) => document.querySelector(selector);
  const picker = $("#team-picker");
  const status = $("#data-status");
  const jsonp = { sequence: 0 };
  const requests = { active: 0, queue: [] };
  const groupCache = new Map();
  const profileCache = new Map();
  let selectedTeam = 0;
  let selectedRound = 0;
  let currentProfile = null;
  let currentTeamCode = "";
  let currentRows = [];
  let rounds = [];

  const normalized = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("es").trim();
  const dateValue = (iso) => iso ? new Date(`${iso}T12:00:00`) : null;
  const dateLabel = (iso) => iso ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(dateValue(iso)) : "Fecha por confirmar";
  const isFinal = (row) => ["F", "N"].includes(String(row.Estado || "").trim().toUpperCase());
  const score = (value) => value == null || value === "" ? null : Number(value);
  const restName = (name) => normalized(name).includes("DESCANSA");

  function setStatus(message, kind = "") {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function requestJsonpOnce(params) {
    return new Promise((resolve, reject) => {
      const callback = `__madridOpenData${Date.now()}_${++jsonp.sequence}`;
      const url = new URL(config.openData.api);
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
      url.searchParams.set("callback", callback);
      const script = document.createElement("script");
      let timeout;
      const cleanup = () => {
        clearTimeout(timeout);
        script.remove();
        delete window[callback];
      };
      window[callback] = (payload) => {
        cleanup();
        if (!payload || !payload.success) reject(new Error(payload?.error?.message || "La API de Madrid devolvió una respuesta no válida."));
        else resolve(payload.result);
      };
      script.onerror = () => { cleanup(); reject(new Error("No se pudo conectar con datos.madrid.es.")); };
      timeout = setTimeout(() => { cleanup(); reject(new Error("La consulta a Open Data ha tardado demasiado.")); }, 40000);
      script.src = url.href;
      document.head.append(script);
    });
  }

  function dispatchRequests() {
    while (requests.active < 2 && requests.queue.length) {
      const job = requests.queue.shift();
      requests.active++;
      requestJsonpOnce(job.params)
        .then(job.resolve)
        .catch((error) => {
          if (job.attempt < 2) {
            job.attempt++;
            setTimeout(() => { requests.queue.push(job); dispatchRequests(); }, 1000 * job.attempt);
          } else job.reject(error);
        })
        .finally(() => { requests.active--; dispatchRequests(); });
    }
  }

  function requestJsonp(params) {
    return new Promise((resolve, reject) => {
      requests.queue.push({ params, resolve, reject, attempt: 0 });
      dispatchRequests();
    });
  }

  async function getGroupRows(groupId) {
    if (groupCache.has(groupId)) return groupCache.get(groupId);
    const pageSize = Math.max(100, Number(config.openData.pageSize) || 1000);
    let offset = 0;
    let all = [];
    let total = 0;
    do {
      const result = await requestJsonp({
        resource_id: config.openData.matchesResource,
        filters: JSON.stringify({ Codigo_grupo: String(groupId) }),
        limit: pageSize,
        offset
      });
      all = all.concat(result.records || []);
      total = Number(result.total) || all.length;
      offset += pageSize;
    } while (offset < total && offset < 10000);
    all.sort((a, b) => Number(a.Jornada) - Number(b.Jornada) || String(a.Fecha || "").localeCompare(String(b.Fecha || "")) || Number(a.Partido) - Number(b.Partido));
    groupCache.set(groupId, all);
    return all;
  }

  async function loadProfile(profile) {
    const name = profile.name.trim();
    if (!name) throw new Error("Falta el nombre oficial del equipo en data.js.");

    let groupId = String(profile.groupId || "").trim();
    let rows = [];
    let exact = [];
    if (groupId) {
      rows = await getGroupRows(groupId);
      exact = rows.filter((row) => normalized(row.Equipo_local) === normalized(name) || normalized(row.Equipo_visitante) === normalized(name));
      if (!exact.length) { groupCache.delete(groupId); groupId = ""; }
    }
    if (!groupId) {
      const searchTerm = profile.groupName || name;
      const result = await requestJsonp({
        resource_id: config.openData.matchesResource,
        q: searchTerm,
        limit: config.openData.pageSize || 1000
      });
      const discoveryRows = result.records || [];
      exact = discoveryRows.filter((row) => {
        const sameGroup = !profile.groupName || normalized(row.Nombre_grupo) === normalized(profile.groupName);
        const sameTeam = normalized(row.Equipo_local) === normalized(name) || normalized(row.Equipo_visitante) === normalized(name);
        return sameGroup && sameTeam;
      });
      const groups = [...new Set(exact.map((row) => String(row.Codigo_grupo || "")).filter(Boolean))];
      if (!groups.length) throw new Error(`No encontré “${name}” en el grupo “${profile.groupName || "temporada actual"}”. Revisa el nombre o la categoría.`);
      if (groups.length > 1) throw new Error(`“${name}” aparece en varios grupos (${groups.join(", ")}). Indica el Codigo_grupo correcto en data.js.`);
      groupId = groups[0];
      rows = await getGroupRows(groupId);
      exact = rows.filter((row) => normalized(row.Equipo_local) === normalized(name) || normalized(row.Equipo_visitante) === normalized(name));
    }

    if (!rows.length) throw new Error(`No hay partidos disponibles para el grupo ${groupId}.`);
    if (!exact.length) throw new Error(`El equipo “${name}” no aparece en el grupo ${groupId}. Comprueba el nombre o el Codigo_grupo.`);
    const selectedCode = exact[0].Codigo_equipo1 && normalized(exact[0].Equipo_local) === normalized(name) ? exact[0].Codigo_equipo1 : exact[0].Codigo_equipo2;
    return { rows, groupId, selectedCode };
  }

  function buildRounds(rows) {
    const byNumber = new Map();
    rows.forEach((row) => {
      const number = Number(row.Jornada) || Number(row.Nombre_jornada) || 0;
      if (!byNumber.has(number)) byNumber.set(number, []);
      byNumber.get(number).push(row);
    });
    return [...byNumber.entries()].sort((a, b) => a[0] - b[0]).map(([number, games]) => ({ number, games }));
  }

  function gameDateTime(game) {
    if (!game.Fecha) return null;
    const time = String(game.Hora || "23:59").slice(0, 5);
    return new Date(`${game.Fecha}T${time}:00`);
  }

  function nextMatch(profile, data) {
    if (!data) return null;
    const now = new Date();
    return data.rows
      .filter((game) => [game.Codigo_equipo1, game.Codigo_equipo2].some((code) => String(code) === String(data.selectedCode)))
      .filter((game) => !isFinal(game) && String(game.Programado) === "1")
      .filter((game) => !restName(game.Equipo_local) && !restName(game.Equipo_visitante))
      .map((game) => ({ game, date: gameDateTime(game) }))
      .filter((entry) => entry.date && entry.date >= now)
      .sort((a, b) => a.date - b.date)[0]?.game || null;
  }

  function addUpcomingTeam(container, name, initials, club = false) {
    const team = document.createElement("div"); team.className = "upcoming-team";
    const badge = document.createElement("span"); badge.className = `team-badge${club ? " club" : ""}`; badge.textContent = initials || teamInitials(name);
    const label = document.createElement("span"); label.className = "team-name"; label.textContent = name;
    const role = document.createElement("span"); role.className = "team-role"; role.textContent = club ? "HA BASKET" : "RIVAL";
    team.append(badge, label, role); container.append(team);
  }

  function renderUpcoming() {
    const grid = $("#upcoming-grid"); grid.replaceChildren();
    config.teams.forEach((profile, index) => {
      const result = profileCache.get(index);
      const data = result?.data;
      const game = nextMatch(profile, data);
      const card = document.createElement("button");
      card.type = "button";
      card.className = `upcoming-card${index === selectedTeam ? " is-active" : ""}`;
      card.setAttribute("aria-label", game ? `${profile.label}, próximo partido contra ${String(game.Codigo_equipo1) === String(data.selectedCode) ? game.Equipo_visitante : game.Equipo_local}` : `${profile.label}, información de próximos partidos`);
      card.addEventListener("click", () => selectProfile(index, true));

      const head = document.createElement("div"); head.className = "upcoming-card-head";
      const category = document.createElement("div"); category.className = "upcoming-category";
      const group = document.createElement("p"); group.className = "eyebrow"; group.textContent = profile.groupName;
      const name = document.createElement("strong"); name.textContent = profile.label;
      category.append(group, name);
      const dateChip = document.createElement("span"); dateChip.className = "round-date";
      if (game) dateChip.textContent = `Jornada ${game.Jornada} · ${dateLabel(game.Fecha)}`;
      else dateChip.textContent = "PRÓXIMAMENTE";
      head.append(category, dateChip);
      card.append(head);

      if (game) {
        const row = document.createElement("div"); row.className = "upcoming-match";
        const homeIsClub = String(game.Codigo_equipo1) === String(data.selectedCode);
        const homeName = game.Equipo_local || "Equipo local";
        const awayName = game.Equipo_visitante || "Equipo visitante";
        addUpcomingTeam(row, homeName, homeIsClub ? profile.initials : teamInitials(homeName), homeIsClub);
        const center = document.createElement("div"); center.className = "upcoming-center";
        const vs = document.createElement("strong"); vs.textContent = "VS";
        const hour = document.createElement("span"); hour.textContent = game.Hora ? `${game.Hora} h` : "Hora pendiente";
        center.append(vs, hour);
        row.append(center);
        addUpcomingTeam(row, awayName, !homeIsClub ? profile.initials : teamInitials(awayName), !homeIsClub);
        card.append(row);
        const venue = document.createElement("div"); venue.className = "upcoming-venue";
        const venueText = document.createElement("span"); venueText.textContent = game.Campo || "Sede por confirmar";
        const arrow = document.createElement("span"); arrow.className = "venue-arrow"; arrow.textContent = "↗";
        venue.append(venueText, arrow); card.append(venue);
      } else {
        const empty = document.createElement("div"); empty.className = "placeholder-inner";
        const text = document.createElement("strong"); text.textContent = result?.error ? "No se pudo cargar" : "Sin partido próximo";
        const detail = document.createElement("span"); detail.textContent = result?.error?.message || "No hay un encuentro futuro programado en Open Data.";
        empty.append(text, detail); card.append(empty);
      }
      grid.append(card);
    });

    const slots = Math.max(6, config.teams.length);
    for (let i = config.teams.length; i < slots; i++) {
      const placeholder = document.createElement("div"); placeholder.className = "upcoming-card placeholder";
      const inner = document.createElement("div"); inner.className = "placeholder-inner";
      const name = document.createElement("strong"); name.textContent = `EQUIPO ${i + 1}`;
      const note = document.createElement("span"); note.textContent = "Pendiente de configurar";
      inner.append(name, note); placeholder.append(inner); grid.append(placeholder);
    }
  }

  function chooseInitialRound() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const next = rounds.findIndex((round) => round.games.some((game) => !isFinal(game) && dateValue(game.Fecha) >= today));
    if (next >= 0) return next;
    const pending = rounds.findIndex((round) => round.games.some((game) => !isFinal(game)));
    return pending >= 0 ? pending : Math.max(0, rounds.length - 1);
  }

  function fillHeader() {
    $("#footer-source").textContent = config.sourceNote;
    const contact = $("#contact-link");
    contact.textContent = config.contactLabel;
    contact.hidden = !config.contactUrl;
    if (config.contactUrl) contact.href = config.contactUrl;
    picker.replaceChildren(...config.teams.map((item, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = item.label || item.name;
      return option;
    }));
  }

  function clearViews() {
    currentRows = [];
    rounds = [];
    $("#featured-title").textContent = "Jornada —";
    $("#featured-match").replaceChildren();
    $("#results-list").replaceChildren();
    $("#standings-body").replaceChildren();
    $("#standings-caption").textContent = "";
    $("#venue-link").hidden = true;
    $("#previous-round").disabled = true;
    $("#next-round").disabled = true;
  }

  function teamInitials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "🏀";
  }

  function appendTeam(container, name, selected = false, color = "#f2d54b") {
    const side = document.createElement("div");
    side.className = `team-side${selected ? " is-selected" : ""}`;
    const crest = document.createElement("div");
    crest.className = "team-crest";
    crest.style.setProperty("--team-color", color);
    crest.textContent = teamInitials(name);
    const label = document.createElement("div");
    label.className = "team-name";
    label.textContent = name;
    side.append(crest, label);
    container.append(side);
  }

  function appendCenter(container, game) {
    const center = document.createElement("div");
    center.className = "match-center";
    const versus = document.createElement("span"); versus.className = "versus"; versus.textContent = "VS";
    const date = document.createElement("time");
    date.textContent = dateLabel(game.Fecha);
    if (game.Fecha) date.dateTime = game.Fecha;
    const info = document.createElement("strong");
    const homeScore = score(game.Resultado1); const awayScore = score(game.Resultado2);
    info.textContent = isFinal(game) && homeScore !== null && awayScore !== null ? `${homeScore} — ${awayScore}` : (game.Hora ? `${game.Hora} h` : "Hora por confirmar");
    center.append(versus, date, info);
    container.append(center);
  }

  function currentGame() {
    return rounds[selectedRound]?.games.find((game) => String(game.Codigo_equipo1) === String(currentTeamCode) || String(game.Codigo_equipo2) === String(currentTeamCode));
  }

  function renderFeature() {
    const round = rounds[selectedRound];
    $("#featured-title").textContent = `Jornada ${round?.number ?? "—"}`;
    const game = currentGame();
    const feature = $("#featured-match"); feature.replaceChildren();
    if (!game) {
      const empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = "No hay partido de este equipo en esta jornada.";
      feature.append(empty); $("#venue-link").hidden = true; return;
    }
    const homeName = game.Equipo_local || "Equipo local";
    const awayName = game.Equipo_visitante || "Equipo visitante";
    const homeIsSelected = String(game.Codigo_equipo1) === String(currentTeamCode);
    const awayIsRest = restName(awayName);
    appendTeam(feature, homeName, homeIsSelected, config.teams[selectedTeam].color);
    if (awayIsRest) {
      appendCenter(feature, game);
      const away = document.createElement("div"); away.className = "team-side";
      const rest = document.createElement("div"); rest.className = "team-name rest-label"; rest.textContent = "DESCANSA";
      away.append(rest); feature.append(away);
    } else {
      appendCenter(feature, game);
      appendTeam(feature, awayName, !homeIsSelected, config.teams[selectedTeam].color);
    }
    const link = $("#venue-link");
    const venue = game.Campo || "";
    if (venue) {
      const latitude = Number(game.COORD_Y_CAMPO); const longitude = Number(game.COORD_X_CAMPO);
      link.href = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0
        ? `https://www.google.com/maps?q=${latitude},${longitude}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
      link.textContent = venue; link.hidden = false;
    } else link.hidden = true;
  }

  function renderResults() {
    const list = $("#results-list"); list.replaceChildren();
    const games = rounds[selectedRound]?.games || [];
    games.forEach((game) => {
      const row = document.createElement("div"); row.className = "result-row";
      const home = document.createElement("span"); home.className = `result-team${String(game.Codigo_equipo1) === String(currentTeamCode) ? " is-selected" : ""}`; home.textContent = game.Equipo_local || "Equipo local";
      const homeScore = document.createElement("span"); homeScore.className = "score"; homeScore.textContent = isFinal(game) ? String(score(game.Resultado1) ?? "—") : "·";
      const awayScore = document.createElement("span"); awayScore.className = "score"; awayScore.textContent = isFinal(game) ? String(score(game.Resultado2) ?? "—") : "·";
      const away = document.createElement("span"); away.className = `result-team${String(game.Codigo_equipo2) === String(currentTeamCode) ? " is-selected" : ""}`; away.textContent = game.Equipo_visitante || "Equipo visitante";
      row.append(home, homeScore, awayScore, away); list.append(row);
    });
  }

  function getStandings() {
    const teams = new Map();
    currentRows.forEach((game) => {
      [[game.Codigo_equipo1, game.Equipo_local], [game.Codigo_equipo2, game.Equipo_visitante]].forEach(([code, name]) => {
        if (!code || String(code) === "0" || restName(name)) return;
        if (!teams.has(String(code))) teams.set(String(code), { code: String(code), name, played: 0, won: 0, lost: 0, scored: 0, conceded: 0 });
      });
    });
    currentRows.forEach((game) => {
      if (!isFinal(game) || !game.Codigo_equipo1 || !game.Codigo_equipo2 || String(game.Codigo_equipo2) === "0") return;
      const home = teams.get(String(game.Codigo_equipo1)); const away = teams.get(String(game.Codigo_equipo2));
      const homeScore = score(game.Resultado1); const awayScore = score(game.Resultado2);
      if (!home || !away || homeScore === null || awayScore === null) return;
      home.played++; away.played++;
      home.scored += homeScore; home.conceded += awayScore;
      away.scored += awayScore; away.conceded += homeScore;
      if (homeScore > awayScore) { home.won++; away.lost++; }
      else if (awayScore > homeScore) { away.won++; home.lost++; }
      else { home.lost++; away.lost++; }
    });
    return [...teams.values()].sort((a, b) => b.won - a.won || (b.scored - b.conceded) - (a.scored - a.conceded) || b.scored - a.scored || a.name.localeCompare(b.name, "es"));
  }

  function renderStandings() {
    const first = currentRows[0];
    $("#standings-caption").textContent = first ? `${first.Nombre_grupo || "Grupo municipal"} · ${first.Nombre_categoria || first.Nombre_deporte || ""} · ${first.Distrito || "Madrid"}` : "";
    const body = $("#standings-body"); body.replaceChildren();
    getStandings().forEach((row, index) => {
      const tr = document.createElement("tr");
      if (row.code === String(currentTeamCode)) tr.className = "selected-row";
      const values = [index + 1, row.name, row.played, row.won, row.lost, `${row.played ? Math.round(row.won / row.played * 100) : 0}%`, row.scored, row.conceded, row.scored - row.conceded];
      values.forEach((value, cellIndex) => {
        const cell = document.createElement(cellIndex < 2 ? "th" : "td");
        if (cellIndex < 2) cell.scope = "row";
        cell.textContent = String(value); tr.append(cell);
      });
      body.append(tr);
    });
  }

  function render() {
    const profile = config.teams[selectedTeam];
    $("#team-title").textContent = currentProfile?.label || currentProfile?.name || profile.name;
    const sample = currentRows[0];
    if (sample) {
      $("#season-title").textContent = `${sample.Nombre_temporada || config.season} · ${sample.Nombre_fase || ""}`.trim();
    }
    $("#team-category").textContent = sample ? `${sample.Nombre_deporte} · ${sample.Nombre_categoria}` : config.category;
    picker.value = String(selectedTeam);
    if (!rounds.length) return;
    renderFeature(); renderResults(); renderStandings();
    $("#previous-round").disabled = selectedRound <= 0;
    $("#next-round").disabled = selectedRound >= rounds.length - 1;
  }

  function selectProfile(index, scrollToDetail = false) {
    selectedTeam = index;
    currentProfile = config.teams[index];
    currentTeamCode = "";
    clearViews();
    $("#team-title").textContent = currentProfile.label || currentProfile.name;
    $("#team-category").textContent = config.category;
    picker.value = String(index);
    const cached = profileCache.get(index);
    if (cached?.data) {
      const result = cached.data;
      currentRows = result.rows;
      currentTeamCode = String(result.selectedCode);
      rounds = buildRounds(currentRows);
      selectedRound = chooseInitialRound();
      render();
    } else {
      const message = cached?.error?.message || "No se pudieron cargar los datos oficiales.";
      const empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = message;
      $("#featured-match").append(empty);
    }
    renderUpcoming();
    if (scrollToDetail) $("#team-detail").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadAllProfiles() {
    setStatus("Consultando los calendarios oficiales…", "loading");
    $("#overview-meta").textContent = `${config.teams.length} equipos · calendario municipal`;
    const results = await Promise.all(config.teams.map(async (profile) => {
      try { return { data: await loadProfile(profile) }; }
      catch (error) { return { error }; }
    }));
    results.forEach((result, index) => profileCache.set(index, result));
    const connected = results.filter((result) => result.data).length;
    $("#overview-meta").textContent = `${connected} de ${config.teams.length} equipos conectados · próximos encuentros municipales`;
    setStatus(`${connected}/${config.teams.length} calendarios consultados · ${new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`, connected ? "success" : "error");
    renderUpcoming();
    const firstAvailable = results.findIndex((result) => result.data);
    selectProfile(firstAvailable >= 0 ? firstAvailable : 0, false);
  }

  picker.addEventListener("change", () => selectProfile(Number(picker.value), false));
  $("#previous-round").addEventListener("click", () => { if (selectedRound > 0) selectedRound--; render(); });
  $("#next-round").addEventListener("click", () => { if (selectedRound < rounds.length - 1) selectedRound++; render(); });
  fillHeader();
  loadAllProfiles();
})();
