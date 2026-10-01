const SUBJECTS = {
  german: { id: "german", name: "German", monogram: "DE", tone: "blue", speech: "de-DE" },
  french: { id: "french", name: "French", monogram: "FR", tone: "rose", speech: "fr-FR" },
  english: { id: "english", name: "English", monogram: "EN", tone: "green", speech: "en-GB" },
  other: { id: "other", name: "Other", monogram: "··", tone: "violet", speech: "en-GB" },
  latin: { id: "latin", name: "Latin", monogram: "LA", tone: "amber", speech: "la" },
  greek: { id: "greek", name: "Greek", monogram: "GR", tone: "teal", speech: "el-GR", hidden: true }
};

const routeSlug = window.location.pathname.split("/").filter(Boolean)[0] || null;
const routeSubjectId = routeSlug && SUBJECTS[routeSlug] ? routeSlug : null;

const state = {
  lists: [],
  selectedListId: null,
  queue: [],
  queueLabel: null,
  practiceMode: "flashcard",
  activeSubjectId: routeSubjectId,
  history: readLocal("dayweaveLearnHistory", readLocal("dayflowLearnHistory", [])),
  stats: readLocal("dayweaveLearnStats", readLocal("dayflowLearnStats", {})),
  round: null,
  openGroups: new Set()
};

const els = Object.fromEntries([
  "dashboardView", "subjectView", "subjectGrid", "subjectCount", "dashboardHistory",
  "dashboardAccuracy", "dashboardAnswers", "dashboardMastered", "dashboardMasteredTotal", "dashboardRounds",
  "headerMastered", "themeButton", "homeLink", "subjectMonogram", "subjectTitle", "subjectAccuracy", "subjectSummary",
  "libraryTab", "historyTab", "libraryView", "historyView", "listCount", "listStack", "historyStack",
  "dropDeck", "deckTitle", "deckSubtitle", "weakButton", "clearButton", "startButton", "pulseText",
  "progressRing", "accuracyValue", "selectedListTitle", "addAllButton", "cardPanelHint", "wordStack",
  "practiceOverlay", "closeRoundButton", "roundTitle", "roundCounter", "liveScore", "roundProgress",
  "studyCard", "sideLabel", "questionText", "questionContext", "answerDivider", "answerText", "revealHint", "answerActions",
  "againButton", "correctButton", "roundSummary", "summaryScore", "finishButton", "toast", "typingArea",
  "typedAnswer", "checkAnswerButton", "revealAnswerButton", "listenButton", "typingFeedback", "practiceMode", "mobileNav",
  "declensionArea", "checkDeclensionButton", "nextDeclensionButton", "declensionFeedback"
].map(id => [id, document.getElementById(id)]));

const icons = {
  stack: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 9 8-5 8 5-8 5-8-5Zm0 4 8 5 8-5M4 17l8 5 8-5"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`,
  book: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Zm16 0A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z"/></svg>`
};

function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage may be unavailable. */ }
}

async function loadLists() {
  try {
    const response = await fetch("/data/lists.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load lists");
    const payload = await response.json();
    let lists = Array.isArray(payload.lists) ? payload.lists : [];
    if (Array.isArray(payload.sources)) {
      const subjectPayloads = await Promise.all(payload.sources.map(async source => {
        const subjectResponse = await fetch(`/data/${source}`, { cache: "no-store" });
        if (!subjectResponse.ok) throw new Error(`Could not load ${source}`);
        return subjectResponse.json();
      }));
      lists = subjectPayloads.flatMap(subjectPayload => Array.isArray(subjectPayload.lists) ? subjectPayload.lists : []);
    }
    state.lists = lists.map(normalizeList);
  } catch {
    state.lists = [];
    showToast("The shared lists could not be loaded.");
  }
  renderApp();
}

function normalizeList(list, listIndex) {
  const id = String(list.id || `list-${listIndex}`);
  const subject = explicitSubject(list) || inferSubject(list);
  const cards = list.kind === "declension" ? declensionCards(list, id, subject)
    : list.kind === "conjugation" ? conjugationCards(list, id, subject)
    : normalCards(list, id, subject);
  return {
    id,
    subject,
    kind: String(list.kind || "vocabulary"),
    group: list.group ? String(list.group) : null,
    stage: list.stage ? String(list.stage) : null,
    title: String(list.title || "Untitled list"),
    summary: String(list.summary || ""),
    cards,
    reverse: Boolean(list.reverse)
  };
}

function normalCards(list, id, subject) {
  return Array.isArray(list.cards) ? list.cards.map((card, cardIndex) => ({
    id: String(card.id || `${id}-${cardIndex}`), listId: id, subject,
    question: String(card.question || ""), answer: String(card.answer || ""), hint: card.hint ? String(card.hint) : "",
    acceptedAnswers: Array.isArray(card.acceptedAnswers) ? card.acceptedAnswers.map(String) : undefined,
    exercise: ["flashcard", "typing", "listening"].includes(card.exercise) ? card.exercise : "flashcard"
  })).filter(card => card.question && card.answer) : [];
}

function declensionCards(list, id, subject) {
  const caseLabels = { nominative: "nominativus", genitive: "genitivus", dative: "dativus", accusative: "accusativus", ablative: "ablativus", vocative: "vocativus" };
  const numberLabels = { singular: "enkelvoud", plural: "meervoud" };
  const genderLabels = { masculine: "mannelijk", feminine: "vrouwelijk", neuter: "onzijdig" };
  if (String(list.group || "").startsWith("Verbuigingsgroep")) {
    return (Array.isArray(list.entries) ? list.entries : []).flatMap((entry, entryIndex) => {
      const forms = new Map();
      Object.entries(entry.forms || {}).forEach(([formKey, value]) => {
        const answer = String(value || "");
        if (!answer) return;
        const [caseName, numberName] = formKey.split("_");
        if (!forms.has(answer)) forms.set(answer, { cases: new Set(), numbers: new Set() });
        forms.get(answer).cases.add(caseName); forms.get(answer).numbers.add(numberName);
      });
      return [...forms.entries()].map(([form, traits], formIndex) => {
        const cases = [...traits.cases]; const numbers = [...traits.numbers]; const genders = [String(entry.gender || "")].filter(Boolean);
        const answer = `${cases.map(value => caseLabels[value] || value).join(" / ")} · ${numbers.map(value => numberLabels[value] || value).join(" / ")} · ${genders.map(value => genderLabels[value] || value).join(" / ")}`;
        return { id: `${id}-${entryIndex}-classify-${formIndex}`, listId: id, subject, question: form, answer, classification: { cases, numbers, genders }, exercise: "classification" };
      });
    });
  }
  return (Array.isArray(list.entries) ? list.entries : []).flatMap((entry, entryIndex) =>
    Object.entries(entry.forms || {}).map(([formKey, answer]) => {
      const [caseName, numberName] = formKey.split("_");
      return {
        id: `${id}-${entryIndex}-${formKey}`, listId: id, subject,
        question: `${entry.lemma || "Form"} — ${caseLabels[caseName] || caseName} ${numberLabels[numberName] || numberName}`,
        answer: String(answer || ""), acceptedAnswers: Array.isArray(entry.acceptedAnswers?.[formKey]) ? entry.acceptedAnswers[formKey].map(String) : undefined,
        exercise: "typing"
      };
    }).filter(card => card.answer)
  );
}

function conjugationCards(list, id, subject) {
  return (Array.isArray(list.entries) ? list.entries : []).flatMap((entry, entryIndex) => [
    { id: `${id}-${entryIndex}-third-singular`, listId: id, subject, question: `${entry.infinitive} — hij/zij/het`, answer: String(entry.thirdSingular || ""), exercise: "typing" },
    { id: `${id}-${entryIndex}-third-plural`, listId: id, subject, question: `${entry.infinitive} — zij (meervoud)`, answer: String(entry.thirdPlural || ""), exercise: "typing" },
    { id: `${id}-${entryIndex}-infinitive`, listId: id, subject, question: `${entry.thirdSingular} / ${entry.thirdPlural} — infinitivus`, answer: String(entry.infinitive || ""), exercise: "typing" }
  ]).filter(card => card.answer);
}

function explicitSubject(list) {
  const value = String(list.subject || "").toLocaleLowerCase();
  return SUBJECTS[value] ? value : null;
}

function inferSubject(list) {
  const title = String(list.title || "").toLocaleLowerCase();
  const id = String(list.id || "").toLocaleLowerCase();
  if (title.includes("frans") || title.includes("french") || id.startsWith("french-")) return "french";
  if (title.includes("engels") || title.includes("english")) return "english";
  if (["lektion", "vraagwoorden", "getallen", "werkwoorden", "duits", "german"].some(word => title.includes(word))) return "german";
  return "other";
}

function expandedLists() {
  const sourceLists = state.lists.flatMap(list => list.id === "french-travel-4"
    ? [{ ...list, cards: list.cards.slice(0, 20) }, { ...list, id: "french-travel-8", title: "Unité 1 · Apprendre 8 · vocabulaire Écrire", cards: list.cards.slice(20).map(card => ({ ...card, listId: "french-travel-8" })) }]
    : [list]);
  return sourceLists.flatMap(list => {
    if (!list.reverse) return [list];
    const reverse = {
      ...list, id: `${list.id}-reverse`, title: `${list.title} · reverse`,
      cards: list.cards.map(card => ({ ...card, id: `${card.id}-reverse`, listId: `${list.id}-reverse`, question: card.answer, answer: card.question, acceptedAnswers: [card.question] }))
    };
    return [list, reverse];
  });
}

function groupedSubjects() {
  const grouped = new Map();
  expandedLists().forEach(list => {
    const meta = SUBJECTS[list.subject] || SUBJECTS.other;
    if (!grouped.has(meta.id)) grouped.set(meta.id, { ...meta, lists: [] });
    grouped.get(meta.id).lists.push(list);
  });
  const order = ["latin", "german", "french", "english", "other"];
  return [...grouped.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

function activeSubject() {
  if (!state.activeSubjectId) return null;
  return groupedSubjects().find(subject => subject.id === state.activeSubjectId) || { ...SUBJECTS[state.activeSubjectId], lists: [] };
}

function subjectCards(subjectId) { return expandedLists().filter(list => list.subject === subjectId).flatMap(list => list.cards); }
function allCards() { return expandedLists().flatMap(list => list.cards); }
function queueHas(id) { return state.queue.some(card => card.id === id); }

function renderApp() {
  const onSubject = Boolean(state.activeSubjectId);
  document.body.dataset.page = onSubject ? "subject" : "dashboard";
  els.dashboardView.hidden = onSubject;
  els.subjectView.hidden = !onSubject;
  els.mobileNav.hidden = !onSubject;
  els.homeLink.hidden = !onSubject;
  renderGlobalStats();
  if (onSubject) renderSubjectPage(); else renderDashboard();
}

function statsFor(cards) {
  const ids = new Set(cards.map(card => card.id));
  let attempts = 0, correct = 0, mastered = 0;
  cards.forEach(card => {
    const stat = state.stats[card.id];
    if (!stat) return;
    const total = (stat.correct || 0) + (stat.incorrect || 0);
    attempts += total; correct += stat.correct || 0;
    if (total >= 2 && (stat.correct || 0) / total >= .8) mastered++;
  });
  return { attempts, correct, mastered, total: ids.size, accuracy: attempts ? Math.round(correct / attempts * 100) : null };
}

function renderGlobalStats() {
  const stats = statsFor(allCards());
  els.headerMastered.textContent = stats.mastered;
  els.dashboardAccuracy.textContent = stats.accuracy === null ? "—" : `${stats.accuracy}%`;
  els.dashboardAnswers.textContent = stats.attempts ? `${stats.attempts} answers` : "No answers yet";
  els.dashboardMastered.textContent = stats.mastered;
  els.dashboardMasteredTotal.textContent = `of ${stats.total} cards`;
  els.dashboardRounds.textContent = state.history.length;
}

function renderDashboard() {
  document.title = "Dashboard · Dayweave Learn";
  const subjects = groupedSubjects().filter(subject => !subject.hidden);
  els.subjectCount.textContent = subjects.length;
  els.subjectGrid.innerHTML = subjects.length ? subjects.map(subject => {
    const cards = subject.lists.flatMap(list => list.cards);
    const stats = statsFor(cards);
    return `<a class="subject-card" href="/${escapeAttr(subject.id)}/" data-tone="${escapeAttr(subject.tone)}">
      <span class="subject-card-icon">${icons.book}</span>
      <span class="subject-card-copy"><strong>${escapeHTML(subject.name)}</strong><small>${subject.lists.length} list${subject.lists.length === 1 ? "" : "s"} · ${cards.length} cards</small></span>
      <span class="subject-card-progress"><b>${stats.accuracy === null ? "New" : `${stats.accuracy}%`}</b><small>${stats.mastered} mastered</small></span>
    </a>`;
  }).join("") : `<div class="empty-state">No subjects are available yet.</div>`;
  renderDashboardHistory();
}

function renderDashboardHistory() {
  if (!state.history.length) {
    els.dashboardHistory.innerHTML = `<div class="empty-state compact">Complete a round and your recent activity will appear here.</div>`;
    return;
  }
  els.dashboardHistory.innerHTML = state.history.slice(0, 5).map(historyHTML).join("");
}

function renderSubjectPage() {
  const subject = activeSubject();
  document.title = `${subject.name} · Dayweave Learn`;
  els.subjectTitle.textContent = subject.name;
  els.subjectMonogram.textContent = subject.monogram;
  els.subjectMonogram.dataset.tone = subject.tone;
  const stats = statsFor(subjectCards(subject.id));
  els.subjectAccuracy.textContent = stats.accuracy === null ? "—" : `${stats.accuracy}%`;
  els.subjectSummary.textContent = stats.attempts ? `${stats.attempts} answers · ${stats.mastered} mastered` : "No answers yet";
  if (!subject.lists.length) {
    state.selectedListId = null;
  } else if (!subject.lists.some(list => list.id === state.selectedListId)) {
    state.selectedListId = subject.lists[0].id;
  }
  renderLists(); renderCards(); renderQueue(); renderHistory(); renderProgress();
  setMobileView("library");
}

function listDisplay(list) {
  const match = list.title.match(/^(.*) · (FR → NL|NL → FR)$/);
  return match ? { title: match[1], direction: match[2] } : { title: list.title, direction: "" };
}

function latinGuideHTML() {
  return `<details class="latin-guide">
    <summary><span><b>Nieuw? Begin hier</b><small>Naamval → getal → groep → uitgang</small></span><span aria-hidden="true">⌄</span></summary>
    <div class="latin-guide-body">
      <p><b>1. Zoek de functie.</b> Nominativus = onderwerp, dativus = aan/voor wie, accusativus = lijdend voorwerp.</p>
      <p><b>2. Kies het getal.</b> Enkelvoud is één; meervoud is meer dan één.</p>
      <p><b>3. Vind groep en stam.</b> Gebruik de tweede woordenboekvorm. Oefen daarna pas de juiste uitgang.</p>
      <div class="ending-table-wrap"><table class="ending-table"><caption>Enkelvoud</caption><thead><tr><th>Groep</th><th>nom.</th><th>dat.</th><th>acc.</th></tr></thead><tbody>
        <tr><th>1</th><td>-a</td><td>-ae</td><td>-am</td></tr>
        <tr><th>2A</th><td>-us/-er</td><td>-o</td><td>-um</td></tr>
        <tr><th>2B</th><td>-um</td><td>-o</td><td>-um</td></tr>
        <tr><th>3A</th><td>—</td><td>-i</td><td>-em</td></tr>
        <tr><th>3B</th><td>—</td><td>-i</td><td>zelfde als nom.</td></tr>
      </tbody></table></div>
      <div class="ending-table-wrap"><table class="ending-table"><caption>Meervoud</caption><thead><tr><th>Groep</th><th>nom.</th><th>dat.</th><th>acc.</th></tr></thead><tbody>
        <tr><th>1</th><td>-ae</td><td>-is</td><td>-as</td></tr>
        <tr><th>2A</th><td>-i</td><td>-is</td><td>-os</td></tr>
        <tr><th>2B</th><td>-a</td><td>-is</td><td>-a</td></tr>
        <tr><th>3A</th><td>-es</td><td>-ibus</td><td>-es</td></tr>
        <tr><th>3B</th><td>-a</td><td>-ibus</td><td>-a</td></tr>
      </tbody></table></div>
      <p class="guide-tip">Begin met <b>Stap 1</b>. Oefen daarna één verbuigingsgroep tegelijk in de open-vraagmodus.</p>
    </div>
  </details>`;
}

function listItemHTML(list) {
  const display = listDisplay(list);
  return `<div class="list-row-item">
    <button class="list-item ${list.id === state.selectedListId ? "selected" : ""}" type="button" data-list-id="${escapeAttr(list.id)}" draggable="true">
      <span class="list-icon">${icons.stack}</span><span class="list-copy"><strong>${escapeHTML(display.title)}</strong><span>${list.stage ? `<b class="stage-badge">${escapeHTML(list.stage)}</b>` : ""}${display.direction ? `<b class="direction-badge">${escapeHTML(display.direction)}</b>` : ""}${list.cards.length} card${list.cards.length === 1 ? "" : "s"}</span></span><span class="chevron">›</span>
    </button>
    <button class="list-practice-button" type="button" data-list-practice="${escapeAttr(list.id)}" aria-label="Practice ${escapeAttr(display.title)}">Practice</button>
  </div>`;
}

function groupedListHTML(lists, subjectId) {
  const groups = new Map();
  const ungrouped = [];
  lists.forEach(list => {
    if (!list.group) { ungrouped.push(list); return; }
    if (!groups.has(list.group)) groups.set(list.group, []);
    groups.get(list.group).push(list);
  });
  if (groups.size && ![...state.openGroups].some(key => key.startsWith(`${subjectId}:`))) {
    state.openGroups.add(`${subjectId}:${groups.keys().next().value}`);
  }
  const grouped = [...groups.entries()].map(([group, groupLists]) => {
    const key = `${subjectId}:${group}`;
    const open = state.openGroups.has(key);
    const cardCount = groupLists.reduce((total, list) => total + list.cards.length, 0);
    return `<section class="list-group ${open ? "open" : ""}">
      <div class="list-group-head">
        <button class="list-group-toggle" type="button" data-group-toggle="${escapeAttr(group)}" aria-expanded="${open}"><span><strong>${escapeHTML(group)}</strong><small>${groupLists.length} list${groupLists.length === 1 ? "" : "s"} · ${cardCount} cards</small></span><span class="folder-chevron" aria-hidden="true">›</span></button>
        <button class="group-practice-button" type="button" data-group-practice="${escapeAttr(group)}">Practice</button>
      </div>
      <div class="group-list-items" ${open ? "" : "hidden"}>${groupLists.map(listItemHTML).join("")}</div>
    </section>`;
  }).join("");
  return grouped + ungrouped.map(listItemHTML).join("");
}

function renderLists() {
  const subject = activeSubject();
  const lists = subject?.lists || [];
  els.listCount.textContent = lists.length;
  if (!lists.length) {
    els.listStack.innerHTML = `<div class="empty-state"><strong>No material yet</strong><br>This route is ready for compact study sets when you add them.</div>`;
    return;
  }
  els.listStack.innerHTML = `${subject.id === "latin" ? latinGuideHTML() : ""}<div class="list-toolbar"><span>${lists.reduce((sum, list) => sum + list.cards.length, 0)} cards available</span><button class="small-button" type="button" data-subject-all="${escapeAttr(subject.id)}">Use all</button></div>
    <div class="subject-lists">${groupedListHTML(lists, subject.id)}</div>`;
  const guide = els.listStack.querySelector(".latin-guide");
  guide?.querySelector("summary")?.addEventListener("click", event => {
    event.preventDefault();
    guide.open = !guide.open;
  });
  els.listStack.querySelector("[data-subject-all]")?.addEventListener("click", () => addSubject(subject.id));
  els.listStack.querySelectorAll("[data-group-toggle]").forEach(button => button.addEventListener("click", () => {
    const key = `${subject.id}:${button.dataset.groupToggle}`;
    if (state.openGroups.has(key)) state.openGroups.delete(key); else state.openGroups.add(key);
    renderLists();
  }));
  els.listStack.querySelectorAll("[data-group-practice]").forEach(button => button.addEventListener("click", () => addGroup(subject.id, button.dataset.groupPractice)));
  els.listStack.querySelectorAll("[data-list-practice]").forEach(button => button.addEventListener("click", () => addList(button.dataset.listPractice)));
  els.listStack.querySelectorAll("[data-list-id]").forEach(button => {
    button.addEventListener("click", () => selectList(button.dataset.listId));
    button.addEventListener("dragstart", event => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("text/dayweave-list", button.dataset.listId); });
  });
}

function renderCards() {
  const list = expandedLists().find(item => item.id === state.selectedListId && item.subject === state.activeSubjectId);
  els.selectedListTitle.textContent = list?.title || "Choose your cards";
  els.addAllButton.hidden = !list?.cards.length;
  els.cardPanelHint.textContent = list ? "Add individual cards or use the whole list." : "Choose a list first.";
  if (!list) { els.wordStack.innerHTML = ""; return; }
  els.wordStack.innerHTML = list.cards.map(card => {
    const added = queueHas(card.id);
    return `<article class="word-card"><div class="word-copy"><strong>${escapeHTML(card.question)}</strong>${card.hint ? `<em>${escapeHTML(card.hint)}</em>` : ""}<span>${escapeHTML(card.answer)}</span></div><button class="add-card-button ${added ? "added" : ""}" type="button" data-card-id="${escapeAttr(card.id)}" aria-label="${added ? "Remove" : "Add"} ${escapeAttr(card.question)}">${added ? `${icons.check}<span>Added</span>` : `${icons.plus}<span>Add</span>`}</button></article>`;
  }).join("");
  els.wordStack.querySelectorAll("[data-card-id]").forEach(button => button.addEventListener("click", () => toggleCard(button.dataset.cardId)));
}

function renderQueue() {
  const count = state.queue.length;
  els.dropDeck.classList.toggle("ready", count > 0);
  els.deckTitle.textContent = count ? `${count} card${count === 1 ? "" : "s"} ready` : "No cards selected yet";
  els.deckSubtitle.textContent = count ? queueName() : "Choose a list, then add the cards you want.";
  els.startButton.disabled = count === 0;
  els.clearButton.hidden = count === 0;
}

function queueName() {
  if (state.queueLabel) return state.queueLabel;
  const listIds = [...new Set(state.queue.map(card => card.listId))];
  if (listIds.length === 1) return expandedLists().find(list => list.id === listIds[0])?.title || "Practice deck";
  return "Mixed practice";
}

function entryBelongsToSubject(entry, subjectId) {
  if (entry.subject) return entry.subject === subjectId;
  const ids = new Set(subjectCards(subjectId).map(card => card.id));
  return entry.results?.some(result => ids.has(result.cardId));
}

function historyHTML(entry) {
  const missed = (entry.results || []).filter(item => !item.correct).map(item => item.question);
  return `<article class="history-item"><div class="history-top"><strong>${escapeHTML(entry.title)}</strong><span class="history-score">${entry.correct}/${entry.total}</span></div><time>${new Date(entry.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>${missed.length ? `<p>Review: ${escapeHTML(missed.slice(0, 3).join(", "))}</p>` : ""}</article>`;
}

function renderHistory() {
  const entries = state.history.filter(entry => entryBelongsToSubject(entry, state.activeSubjectId));
  els.historyStack.innerHTML = entries.length ? entries.slice(0, 20).map(historyHTML).join("") : `<div class="empty-state compact">Finish a ${escapeHTML(activeSubject().name)} round and it will appear here.</div>`;
}

function renderProgress() {
  const stats = statsFor(subjectCards(state.activeSubjectId));
  if (stats.accuracy === null) {
    els.accuracyValue.textContent = "—"; els.progressRing.style.setProperty("--progress", "0deg"); els.pulseText.textContent = "Finish a round to see your progress."; return;
  }
  els.accuracyValue.textContent = `${stats.accuracy}%`;
  els.progressRing.style.setProperty("--progress", `${stats.accuracy * 3.6}deg`);
  els.pulseText.textContent = `${stats.attempts} answers · ${stats.mastered} mastered`;
}

function selectList(id, navigate = true) {
  const list = expandedLists().find(item => item.id === id && item.subject === state.activeSubjectId);
  if (!list) return;
  state.selectedListId = id; renderLists(); renderCards();
  if (navigate && window.matchMedia("(max-width: 760px)").matches) setMobileView("cards");
}

function addList(id) {
  const list = expandedLists().find(item => item.id === id && item.subject === state.activeSubjectId);
  if (!list) return;
  state.queue = list.cards.slice(); state.queueLabel = null; selectList(id, false); renderQueue(); setMobileView("practice"); showToast(`${list.title} is ready.`);
}

function addSubject(id) {
  const subject = groupedSubjects().find(item => item.id === id);
  if (!subject) return;
  state.queue = subject.lists.flatMap(list => list.cards); state.queueLabel = `${subject.name} · all lists`; renderCards(); renderQueue(); setMobileView("practice"); showToast(`${state.queue.length} cards are ready.`);
}

function addGroup(subjectId, group) {
  const lists = expandedLists().filter(list => list.subject === subjectId && list.group === group);
  if (!lists.length) return;
  state.queue = lists.flatMap(list => list.cards);
  state.queueLabel = `${activeSubject().name} · ${group}`;
  renderCards(); renderQueue(); setMobileView("practice"); showToast(`${state.queue.length} cards from ${group} are ready.`);
}

function toggleCard(id) {
  state.queueLabel = null;
  if (queueHas(id)) state.queue = state.queue.filter(card => card.id !== id);
  else { const card = subjectCards(state.activeSubjectId).find(item => item.id === id); if (card) state.queue.push(card); }
  renderCards(); renderQueue();
}

function prepareWeakWords() {
  const cards = subjectCards(state.activeSubjectId);
  const ranked = cards.map(card => {
    const stat = state.stats[card.id] || { correct: 0, incorrect: 0 };
    const total = stat.correct + stat.incorrect;
    return { card, score: stat.incorrect + (total ? (1 - stat.correct / total) * 2 : 0), attempted: total > 0 };
  }).filter(item => item.attempted && item.score > 0).sort((a, b) => b.score - a.score);
  const chosen = (ranked.length ? ranked.map(item => item.card) : shuffle(cards)).slice(0, 20);
  if (!chosen.length) { showToast("There are no cards to practise yet."); return; }
  state.queue = chosen; state.queueLabel = "Weak cards"; renderQueue(); startRound("Weak cards");
}

function startRound(forcedTitle) {
  if (!state.queue.length) return;
  state.round = { title: forcedTitle || queueName(), subject: state.activeSubjectId, cards: shuffle(state.queue), mode: state.practiceMode, index: 0, revealed: false, results: [], typedChecked: false, classificationGraded: false, classificationEvaluation: null };
  els.practiceOverlay.hidden = false; document.body.style.overflow = "hidden"; renderRound();
}

function renderRound() {
  const round = state.round;
  if (!round) return;
  const complete = round.index >= round.cards.length;
  const card = complete ? null : round.cards[round.index];
  const isClassification = !complete && Boolean(card.classification);
  const classificationWaiting = isClassification && !round.classificationGraded;
  const openWaiting = !complete && !card.classification && round.mode === "open" && !round.revealed;
  els.studyCard.hidden = complete;
  els.studyCard.disabled = openWaiting || classificationWaiting;
  els.studyCard.classList.toggle("noninteractive", openWaiting || classificationWaiting);
  els.answerActions.hidden = complete || !round.revealed || isClassification;
  els.typingArea.hidden = complete || Boolean(card?.classification) || round.mode !== "open" || round.revealed;
  els.declensionArea.hidden = complete || !isClassification;
  els.checkDeclensionButton.hidden = !classificationWaiting;
  els.nextDeclensionButton.hidden = !isClassification || !round.classificationGraded;
  els.revealAnswerButton.hidden = complete || round.mode !== "open" || round.revealed;
  els.roundSummary.hidden = !complete;
  els.roundTitle.textContent = round.title;
  els.liveScore.textContent = `${round.results.filter(item => item.correct).length} correct`;
  els.roundProgress.style.width = `${Math.round(round.index / round.cards.length * 100)}%`;
  if (complete) {
    const correct = round.results.filter(item => item.correct).length;
    els.roundCounter.textContent = `${round.cards.length} cards`; els.summaryScore.textContent = `${correct} of ${round.cards.length} correct`; saveRound(); return;
  }
  els.roundCounter.textContent = `${round.index + 1} of ${round.cards.length}`;
  els.questionText.textContent = card.question; els.questionContext.textContent = card.hint || ""; els.questionContext.hidden = !card.hint; els.answerText.textContent = card.answer;
  els.answerText.hidden = !round.revealed; els.answerDivider.hidden = !round.revealed;
  els.revealHint.hidden = round.revealed; els.revealHint.textContent = classificationWaiting ? "Kies hieronder alle juiste kenmerken" : openWaiting ? "Type your answer below" : "Tap to reveal";
  els.sideLabel.textContent = round.revealed ? "Answer" : "Question";
  els.studyCard.setAttribute("aria-label", openWaiting ? "Question" : round.revealed ? `Answer: ${card.answer}` : "Reveal answer");
  if (!round.revealed) {
    els.typedAnswer.value = ""; els.typingFeedback.textContent = ""; els.typingFeedback.classList.remove("correct");
    els.declensionFeedback.textContent = ""; els.declensionFeedback.classList.remove("correct");
    els.declensionArea.querySelectorAll("[data-classifier-group]").forEach(button => {
      button.disabled = false;
      button.classList.remove("active", "correct-option", "wrong-option", "missed-option");
      button.setAttribute("aria-pressed", "false");
    });
    els.listenButton.hidden = cardExercise(card) !== "listening";
    if (round.mode === "open" && !card.classification) requestAnimationFrame(() => els.typedAnswer.focus());
  } else if (isClassification) renderClassificationEvaluation(card, round.classificationEvaluation);
}

function cardExercise(card) { return card.exercise || "flashcard"; }
function normalizeAnswer(value) { return String(value).toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }

function checkTypedAnswer() {
  const round = state.round;
  if (!round || round.mode !== "open" || round.revealed) return;
  const card = round.cards[round.index];
  const given = normalizeAnswer(els.typedAnswer.value);
  if (!given) { els.typingFeedback.textContent = "Type an answer first."; return; }
  const accepted = card.acceptedAnswers || [card.answer];
  const correct = accepted.some(answer => normalizeAnswer(answer) === given);
  round.typedChecked = correct;
  els.typingFeedback.textContent = correct ? "Correct — reveal the answer when you are ready." : "Not quite. Try again or reveal the answer deliberately.";
  els.typingFeedback.classList.toggle("correct", correct);
}

function toggleClassification(button) {
  const active = !button.classList.contains("active");
  button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
}

function checkDeclensionAnswer() {
  const round = state.round;
  const card = round?.cards[round.index];
  if (!round || round.classificationGraded || !card?.classification) return;
  const expected = { case: card.classification.cases, number: card.classification.numbers, gender: card.classification.genders };
  const selected = Object.fromEntries(Object.keys(expected).map(group => [group, [...els.declensionArea.querySelectorAll(`[data-classifier-group="${group}"].active`)].map(button => button.dataset.value)]));
  const same = Object.keys(expected).every(group => [...expected[group]].sort().join("|") === selected[group].sort().join("|"));
  round.classificationGraded = true;
  round.classificationEvaluation = { expected, selected, correct: same };
  round.revealed = true;
  recordResult(round, card, same);
  renderRound();
}

function renderClassificationEvaluation(card, evaluation) {
  if (!evaluation) return;
  els.declensionArea.querySelectorAll("[data-classifier-group]").forEach(button => {
    const group = button.dataset.classifierGroup;
    const value = button.dataset.value;
    const expected = evaluation.expected[group].includes(value);
    const selected = evaluation.selected[group].includes(value);
    button.disabled = true;
    button.classList.toggle("correct-option", expected && selected);
    button.classList.toggle("wrong-option", !expected && selected);
    button.classList.toggle("missed-option", expected && !selected);
  });
  els.declensionFeedback.textContent = evaluation.correct
    ? "Helemaal goed."
    : `Onjuist. Het juiste antwoord is: ${card.answer}.`;
  els.declensionFeedback.classList.toggle("correct", evaluation.correct);
}

function recordResult(round, card, correct) {
  round.results.push({ cardId: card.id, question: card.question, correct });
  const stat = state.stats[card.id] || { correct: 0, incorrect: 0 };
  if (correct) stat.correct += 1; else stat.incorrect += 1;
  stat.lastPracticed = new Date().toISOString(); state.stats[card.id] = stat; writeLocal("dayweaveLearnStats", state.stats);
}

function nextClassificationCard() {
  const round = state.round;
  if (!round?.classificationGraded) return;
  round.index += 1; round.revealed = false; round.typedChecked = false; round.classificationGraded = false; round.classificationEvaluation = null; renderRound();
}

function speakCurrentCard() {
  const card = state.round?.cards[state.round.index];
  if (!card || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(card.question);
  utterance.lang = SUBJECTS[card.subject]?.speech || "en-GB"; utterance.rate = .8; window.speechSynthesis.speak(utterance);
}

function revealAnswer() {
  if (!state.round || state.round.revealed) return;
  state.round.revealed = true; renderRound();
}

function answer(correct) {
  const round = state.round;
  if (!round || !round.revealed) return;
  const card = round.cards[round.index];
  recordResult(round, card, correct);
  round.index += 1; round.revealed = false; round.typedChecked = false; renderRound();
}

function saveRound() {
  if (state.round.saved) return;
  state.round.saved = true;
  state.history.unshift({ id: crypto.randomUUID?.() || String(Date.now()), date: new Date().toISOString(), subject: state.round.subject, title: state.round.title, correct: state.round.results.filter(item => item.correct).length, total: state.round.results.length, results: state.round.results });
  state.history = state.history.slice(0, 100); writeLocal("dayweaveLearnHistory", state.history); renderHistory(); renderProgress(); renderGlobalStats();
}

function closeRound() {
  if (state.round && state.round.results.length && state.round.index < state.round.cards.length && !confirm("Leave this round? Completed answers will not be added to history.")) return;
  els.practiceOverlay.hidden = true; document.body.style.overflow = ""; state.round = null;
}

function finishRound() {
  els.practiceOverlay.hidden = true; document.body.style.overflow = ""; state.queue = []; state.queueLabel = null; state.round = null; renderSubjectPage();
}

function switchTab(showHistory) {
  els.libraryView.hidden = showHistory; els.historyView.hidden = !showHistory;
  els.libraryTab.classList.toggle("active", !showHistory); els.historyTab.classList.toggle("active", showHistory);
  els.libraryTab.setAttribute("aria-selected", String(!showHistory)); els.historyTab.setAttribute("aria-selected", String(showHistory));
}

function setTheme(theme) { document.documentElement.dataset.theme = theme; localStorage.setItem("dayweaveLearnTheme", theme); }
function setMobileView(view) {
  document.body.dataset.mobileView = view;
  document.querySelectorAll("[data-mobile-target]").forEach(button => { const active = button.dataset.mobileTarget === view; button.classList.toggle("active", active); button.setAttribute("aria-current", active ? "page" : "false"); });
  if (window.matchMedia("(max-width: 760px)").matches) requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
}
function showToast(message) { els.toast.textContent = message; els.toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2200); }
function shuffle(items) { const copy = items.slice(); for (let index = copy.length - 1; index > 0; index--) { const swap = Math.floor(Math.random() * (index + 1)); [copy[index], copy[swap]] = [copy[swap], copy[index]]; } return copy; }
function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function escapeAttr(value) { return escapeHTML(value); }

els.libraryTab.addEventListener("click", () => switchTab(false));
els.historyTab.addEventListener("click", () => switchTab(true));
els.themeButton.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "butter" ? "dark" : "butter"));
els.addAllButton.addEventListener("click", () => addList(state.selectedListId));
els.clearButton.addEventListener("click", () => { state.queue = []; state.queueLabel = null; renderCards(); renderQueue(); });
els.startButton.addEventListener("click", () => startRound());
els.practiceMode.addEventListener("change", () => { state.practiceMode = els.practiceMode.value; });
els.weakButton.addEventListener("click", prepareWeakWords);
els.dropDeck.addEventListener("dragover", event => { event.preventDefault(); els.dropDeck.classList.add("drag-over"); });
els.dropDeck.addEventListener("dragleave", () => els.dropDeck.classList.remove("drag-over"));
els.dropDeck.addEventListener("drop", event => { event.preventDefault(); els.dropDeck.classList.remove("drag-over"); addList(event.dataTransfer.getData("text/dayweave-list")); });
els.studyCard.addEventListener("click", () => { if (state.round?.mode === "flashcard") revealAnswer(); });
els.checkAnswerButton.addEventListener("click", checkTypedAnswer);
els.revealAnswerButton.addEventListener("click", revealAnswer);
els.checkDeclensionButton.addEventListener("click", checkDeclensionAnswer);
els.nextDeclensionButton.addEventListener("click", nextClassificationCard);
els.declensionArea.querySelectorAll("[data-classifier-group]").forEach(button => button.addEventListener("click", () => toggleClassification(button)));
els.typedAnswer.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); checkTypedAnswer(); } });
els.listenButton.addEventListener("click", speakCurrentCard);
els.againButton.addEventListener("click", () => answer(false));
els.correctButton.addEventListener("click", () => answer(true));
els.closeRoundButton.addEventListener("click", closeRound);
els.finishButton.addEventListener("click", finishRound);
document.querySelectorAll("[data-mobile-target]").forEach(button => button.addEventListener("click", () => setMobileView(button.dataset.mobileTarget)));
document.addEventListener("keydown", event => {
  if (els.practiceOverlay.hidden || !state.round) return;
  const isTyping = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target?.isContentEditable;
  if (isTyping) { if (event.key === "Escape") closeRound(); return; }
  const isInteractiveControl = event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement || event.target?.matches?.("[role='button']");
  if (isInteractiveControl && event.key !== "Escape") return;
  if (event.key === "Escape") closeRound();
  else if (event.key === " " && state.round.mode === "flashcard" && !state.round.revealed) { event.preventDefault(); revealAnswer(); }
  else if (event.key === "Enter" && state.round.mode === "open" && !state.round.revealed) checkTypedAnswer();
  else if (state.round.revealed && event.key === "1") answer(false);
  else if (state.round.revealed && event.key === "2") answer(true);
});

setTheme(localStorage.getItem("dayweaveLearnTheme") || localStorage.getItem("dayflowLearnTheme") || "dark");
loadLists();
