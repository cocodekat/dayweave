const state = {
  lists: [],
  selectedListId: null,
  queue: [],
  history: readLocal("dayflowLearnHistory", []),
  stats: readLocal("dayflowLearnStats", {}),
  round: null,
};

const els = Object.fromEntries([
  "headerMastered", "themeButton", "libraryTab", "historyTab", "libraryView", "historyView",
  "listCount", "listStack", "historyStack", "dropDeck", "deckTitle", "deckSubtitle",
  "weakButton", "clearButton", "startButton", "pulseText", "progressRing", "accuracyValue",
  "selectedListTitle", "addAllButton", "cardPanelHint", "wordStack", "practiceOverlay",
  "closeRoundButton", "roundTitle", "roundCounter", "liveScore", "roundProgress", "studyCard",
  "sideLabel", "questionText", "answerDivider", "answerText", "revealHint", "answerActions",
  "againButton", "correctButton", "roundSummary", "summaryScore", "finishButton", "toast"
].map(id => [id, document.getElementById(id)]));

const icons = {
  stack: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 9 8-5 8 5-8 5-8-5Zm0 4 8 5 8-5M4 17l8 5 8-5"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`
};

function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing may disable storage. */ }
}

async function loadLists() {
  try {
    const response = await fetch("data/lists.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load lists");
    const payload = await response.json();
    state.lists = Array.isArray(payload.lists) ? payload.lists.map(normalizeList) : [];
  } catch {
    state.lists = [];
    showToast("The shared lists could not be loaded.");
  }
  renderAll();
  if (state.lists[0]) selectList(state.lists[0].id);
}

function normalizeList(list, listIndex) {
  const id = String(list.id || `list-${listIndex}`);
  return {
    id,
    title: String(list.title || "Untitled list"),
    cards: Array.isArray(list.cards) ? list.cards.map((card, cardIndex) => ({
      id: String(card.id || `${id}-${cardIndex}`),
      listId: id,
      question: String(card.question || ""),
      answer: String(card.answer || "")
    })).filter(card => card.question && card.answer) : []
  };
}

function allCards() { return state.lists.flatMap(list => list.cards); }
function queueHas(id) { return state.queue.some(card => card.id === id); }

function renderAll() {
  renderLists();
  renderCards();
  renderQueue();
  renderHistory();
  renderProgress();
}

function renderLists() {
  els.listCount.textContent = state.lists.length;
  if (!state.lists.length) {
    els.listStack.innerHTML = `<div class="empty-state">No lists have been published yet.<br>Check back after your classmate shares one.</div>`;
    return;
  }
  els.listStack.innerHTML = state.lists.map(list => `
    <button class="list-item ${list.id === state.selectedListId ? "selected" : ""}" type="button" data-list-id="${escapeAttr(list.id)}" draggable="true">
      <span class="list-icon">${icons.stack}</span>
      <span class="list-copy"><strong>${escapeHTML(list.title)}</strong><span>${list.cards.length} card${list.cards.length === 1 ? "" : "s"}</span></span>
      <span class="chevron">›</span>
    </button>`).join("");

  els.listStack.querySelectorAll("[data-list-id]").forEach(button => {
    button.addEventListener("click", () => selectList(button.dataset.listId));
    button.addEventListener("dragstart", event => {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/dayflow-list", button.dataset.listId);
      event.dataTransfer.setData("text/plain", button.dataset.listId);
    });
  });
}

function renderCards() {
  const list = state.lists.find(item => item.id === state.selectedListId);
  els.selectedListTitle.textContent = list?.title || "Select a list";
  els.addAllButton.hidden = !list?.cards.length;
  els.cardPanelHint.textContent = list ? `${list.cards.length} shared card${list.cards.length === 1 ? "" : "s"}. Tap + to mix individual words.` : "Pick a list to see every question and answer.";
  if (!list) { els.wordStack.innerHTML = ""; return; }
  els.wordStack.innerHTML = list.cards.map(card => {
    const added = queueHas(card.id);
    return `<article class="word-card">
      <div class="word-copy"><strong>${escapeHTML(card.question)}</strong><span>${escapeHTML(card.answer)}</span></div>
      <button class="add-card-button ${added ? "added" : ""}" type="button" data-card-id="${escapeAttr(card.id)}" aria-label="${added ? "Remove" : "Add"} ${escapeAttr(card.question)} ${added ? "from" : "to"} practice">${added ? icons.check : icons.plus}</button>
    </article>`;
  }).join("");
  els.wordStack.querySelectorAll("[data-card-id]").forEach(button => button.addEventListener("click", () => toggleCard(button.dataset.cardId)));
}

function renderQueue() {
  const count = state.queue.length;
  els.dropDeck.classList.toggle("ready", count > 0);
  els.deckTitle.textContent = count ? `${count} card${count === 1 ? "" : "s"} ready` : "Drop a list here";
  els.deckSubtitle.textContent = count ? queueName() : "or add individual cards from a list";
  els.startButton.disabled = count === 0;
  els.clearButton.hidden = count === 0;
}

function queueName() {
  const listIds = [...new Set(state.queue.map(card => card.listId))];
  if (listIds.length === 1) return state.lists.find(list => list.id === listIds[0])?.title || "Practice deck";
  return "Mixed practice";
}

function renderHistory() {
  if (!state.history.length) {
    els.historyStack.innerHTML = `<div class="empty-state">Finish a practice round and it will appear here.</div>`;
    return;
  }
  els.historyStack.innerHTML = state.history.slice(0, 30).map(entry => {
    const missed = entry.results.filter(item => !item.correct).map(item => item.question);
    return `<article class="history-item">
      <div class="history-top"><strong>${escapeHTML(entry.title)}</strong><span class="history-score">${entry.correct}/${entry.total}</span></div>
      <time>${new Date(entry.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
      ${missed.length ? `<p>Review: ${escapeHTML(missed.join(", "))}</p>` : ""}
    </article>`;
  }).join("");
}

function renderProgress() {
  const stats = Object.values(state.stats);
  const attempts = stats.reduce((sum, value) => sum + (value.correct || 0) + (value.incorrect || 0), 0);
  const correct = stats.reduce((sum, value) => sum + (value.correct || 0), 0);
  const mastered = allCards().filter(card => {
    const stat = state.stats[card.id];
    if (!stat) return false;
    const total = (stat.correct || 0) + (stat.incorrect || 0);
    return total >= 2 && stat.correct / total >= .8;
  }).length;
  els.headerMastered.textContent = mastered;
  if (!attempts) {
    els.accuracyValue.textContent = "—";
    els.progressRing.style.setProperty("--progress", "0deg");
    els.pulseText.textContent = "Finish a round to see your progress.";
    return;
  }
  const accuracy = Math.round(correct / attempts * 100);
  els.accuracyValue.textContent = `${accuracy}%`;
  els.progressRing.style.setProperty("--progress", `${accuracy * 3.6}deg`);
  els.pulseText.textContent = `${attempts} answer${attempts === 1 ? "" : "s"} · ${mastered} mastered`;
}

function selectList(id) {
  state.selectedListId = id;
  renderLists();
  renderCards();
}

function addList(id) {
  const list = state.lists.find(item => item.id === id);
  if (!list) return;
  state.queue = list.cards.slice();
  selectList(id);
  renderQueue();
  showToast(`${list.title} is ready to practise.`);
}

function toggleCard(id) {
  if (queueHas(id)) state.queue = state.queue.filter(card => card.id !== id);
  else {
    const card = allCards().find(item => item.id === id);
    if (card) state.queue.push(card);
  }
  renderCards();
  renderQueue();
}

function prepareWeakWords() {
  const ranked = allCards().map(card => {
    const stat = state.stats[card.id] || { correct: 0, incorrect: 0 };
    const total = stat.correct + stat.incorrect;
    return { card, score: stat.incorrect + (total ? (1 - stat.correct / total) * 2 : 0), attempted: total > 0 };
  }).filter(item => item.attempted && item.score > 0).sort((a, b) => b.score - a.score);
  const chosen = (ranked.length ? ranked.map(item => item.card) : shuffle(allCards())).slice(0, 20);
  if (!chosen.length) { showToast("There are no words to practise yet."); return; }
  state.queue = chosen;
  renderQueue();
  startRound("Weak words");
}

function startRound(forcedTitle) {
  if (!state.queue.length) return;
  state.round = {
    title: forcedTitle || queueName(),
    cards: shuffle(state.queue),
    index: 0,
    revealed: false,
    results: []
  };
  els.practiceOverlay.hidden = false;
  document.body.style.overflow = "hidden";
  renderRound();
}

function renderRound() {
  const round = state.round;
  if (!round) return;
  const complete = round.index >= round.cards.length;
  els.studyCard.hidden = complete;
  els.answerActions.hidden = complete || !round.revealed;
  els.roundSummary.hidden = !complete;
  els.roundTitle.textContent = round.title;
  els.liveScore.textContent = `${round.results.filter(item => item.correct).length} correct`;
  els.roundProgress.style.width = `${Math.round(round.index / round.cards.length * 100)}%`;

  if (complete) {
    const correct = round.results.filter(item => item.correct).length;
    els.roundCounter.textContent = `${round.cards.length} cards`;
    els.summaryScore.textContent = `${correct} of ${round.cards.length} correct`;
    saveRound();
    return;
  }

  const card = round.cards[round.index];
  els.roundCounter.textContent = `${round.index + 1} of ${round.cards.length}`;
  els.questionText.textContent = card.question;
  els.answerText.textContent = card.answer;
  els.answerText.hidden = !round.revealed;
  els.answerDivider.hidden = !round.revealed;
  els.revealHint.hidden = round.revealed;
  els.sideLabel.textContent = round.revealed ? "Answer" : "Question";
  els.studyCard.setAttribute("aria-label", round.revealed ? `Answer: ${card.answer}` : "Reveal answer");
}

function revealAnswer() {
  if (!state.round || state.round.revealed) return;
  state.round.revealed = true;
  renderRound();
}

function answer(correct) {
  const round = state.round;
  if (!round || !round.revealed) return;
  const card = round.cards[round.index];
  round.results.push({ cardId: card.id, question: card.question, correct });
  const stat = state.stats[card.id] || { correct: 0, incorrect: 0 };
  if (correct) stat.correct += 1; else stat.incorrect += 1;
  stat.lastPracticed = new Date().toISOString();
  state.stats[card.id] = stat;
  writeLocal("dayflowLearnStats", state.stats);
  round.index += 1;
  round.revealed = false;
  renderRound();
}

function saveRound() {
  if (state.round.saved) return;
  state.round.saved = true;
  state.history.unshift({
    id: crypto.randomUUID?.() || String(Date.now()),
    date: new Date().toISOString(),
    title: state.round.title,
    correct: state.round.results.filter(item => item.correct).length,
    total: state.round.results.length,
    results: state.round.results
  });
  state.history = state.history.slice(0, 100);
  writeLocal("dayflowLearnHistory", state.history);
  renderHistory();
  renderProgress();
}

function closeRound() {
  if (state.round && state.round.results.length && state.round.index < state.round.cards.length) {
    if (!confirm("Leave this round? Your completed answers will not be added to history.")) return;
  }
  els.practiceOverlay.hidden = true;
  document.body.style.overflow = "";
  state.round = null;
}

function finishRound() {
  els.practiceOverlay.hidden = true;
  document.body.style.overflow = "";
  state.queue = [];
  state.round = null;
  renderAll();
}

function switchTab(showHistory) {
  els.libraryView.hidden = showHistory;
  els.historyView.hidden = !showHistory;
  els.libraryTab.classList.toggle("active", !showHistory);
  els.historyTab.classList.toggle("active", showHistory);
  els.libraryTab.setAttribute("aria-selected", String(!showHistory));
  els.historyTab.setAttribute("aria-selected", String(showHistory));
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("dayflowLearnTheme", theme);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function shuffle(items) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function escapeAttr(value) { return escapeHTML(value); }

els.libraryTab.addEventListener("click", () => switchTab(false));
els.historyTab.addEventListener("click", () => switchTab(true));
els.themeButton.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "butter" ? "dark" : "butter"));
els.addAllButton.addEventListener("click", () => addList(state.selectedListId));
els.clearButton.addEventListener("click", () => { state.queue = []; renderCards(); renderQueue(); });
els.startButton.addEventListener("click", () => startRound());
els.weakButton.addEventListener("click", prepareWeakWords);
els.dropDeck.addEventListener("click", () => { if (state.selectedListId) addList(state.selectedListId); });
els.dropDeck.addEventListener("keydown", event => { if ((event.key === "Enter" || event.key === " ") && state.selectedListId) { event.preventDefault(); addList(state.selectedListId); } });
els.dropDeck.addEventListener("dragover", event => { event.preventDefault(); els.dropDeck.classList.add("drag-over"); });
els.dropDeck.addEventListener("dragleave", () => els.dropDeck.classList.remove("drag-over"));
els.dropDeck.addEventListener("drop", event => {
  event.preventDefault();
  els.dropDeck.classList.remove("drag-over");
  addList(event.dataTransfer.getData("text/dayflow-list") || event.dataTransfer.getData("text/plain"));
});
els.studyCard.addEventListener("click", revealAnswer);
els.againButton.addEventListener("click", () => answer(false));
els.correctButton.addEventListener("click", () => answer(true));
els.closeRoundButton.addEventListener("click", closeRound);
els.finishButton.addEventListener("click", finishRound);
document.addEventListener("keydown", event => {
  if (els.practiceOverlay.hidden || !state.round) return;
  if (event.key === "Escape") closeRound();
  else if (event.key === " " && !state.round.revealed) { event.preventDefault(); revealAnswer(); }
  else if (state.round.revealed && event.key === "1") answer(false);
  else if (state.round.revealed && event.key === "2") answer(true);
});

setTheme(localStorage.getItem("dayflowLearnTheme") || "dark");
loadLists();
