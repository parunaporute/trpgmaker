// js/trash.js
// ゴミ箱画面ロジック (画像プレビューなし)

let trashCards = [];
let trashSelectionMode = false;
let loadedTrashLineCount = 0;
let trashCardsPerRow = 1;
const LINES_PER_TRASH_LOAD = 1;

async function initTrashPage() {
  // 必ず最新データをロード
  window.characterData = await loadCharacterDataFromIndexedDB();
  if (!window.characterData) {
    window.characterData = [];
  }

  setupTrashUI();
  loadTrashCards();
}

function setupTrashUI() {
  const selBtn = document.getElementById("trash-selection-mode-btn");
  if (selBtn) {
    selBtn.addEventListener("click", () => {
      trashSelectionMode = !trashSelectionMode;
      selBtn.textContent = trashSelectionMode ? "選択モード解除" : "選択モード";
      if (!trashSelectionMode) {
        clearTrashSelections();
      }
      updateTrashSelectionButtons();
    });
  }

  document.getElementById("trash-restore-selected-btn")?.addEventListener("click", restoreSelectedTrashCards);
  document.getElementById("trash-delete-selected-btn")?.addEventListener("click", deleteSelectedTrashCards);

  document.getElementById("trash-restore-all-btn")?.addEventListener("click", () => {
    if (confirm("ゴミ箱のカードをすべて倉庫に戻しますか？")) {
      restoreAllTrashCards();
    }
  });
  document.getElementById("trash-delete-all-btn")?.addEventListener("click", () => {
    if (confirm("ゴミ箱を空にします。完全に削除してよろしいですか？")) {
      deleteAllTrashCards();
    }
  });

  // スクロール
  const scrollC = document.getElementById("trash-card-scroll-container");
  if (scrollC) {
    scrollC.addEventListener("scroll", onTrashScrollCheck);
  }
}

function loadTrashCards() {
  const container = document.getElementById("trash-card-container");
  if (!container) return;
  container.style.visibility = "hidden";
  container.innerHTML = "";

  // group="Trash"
  trashCards = (window.characterData || []).filter(c => c.group === "Trash");

  loadedTrashLineCount = 0;
  trashCardsPerRow = calcTrashCardsPerRow();

  loadNextTrashLines(LINES_PER_TRASH_LOAD);
  fillTrashContainerIfNeeded(() => {
    container.style.visibility = "visible";
    container.style.opacity = "1";
  });
}

function fillTrashContainerIfNeeded(callback) {
  const scrollC = document.getElementById("trash-card-scroll-container");
  if (!scrollC) {
    if (callback) callback();
    return;
  }
  let safeCounter = 0;
  while (
    scrollC.scrollHeight <= scrollC.clientHeight &&
    loadedTrashLineCount * trashCardsPerRow < trashCards.length &&
    safeCounter < 50
  ) {
    loadNextTrashLines(LINES_PER_TRASH_LOAD);
    safeCounter++;
  }
  if (callback) callback();
}

function calcTrashCardsPerRow() {
  const container = document.getElementById("trash-card-container");
  if (!container) return 1;
  const containerWidth = container.clientWidth;
  if (containerWidth <= 0) return 1;

  let cardW = 300;
  let gap = 20;
  let per = 1;
  for (let n = 1; n <= 50; n++) {
    const totalW = n * cardW + (n - 1) * gap;
    if (totalW <= containerWidth) {
      per = n;
    } else {
      break;
    }
  }
  return per;
}

function loadNextTrashLines(lineCount) {
  const container = document.getElementById("trash-card-container");
  if (!container) return;

  const displayedCount = loadedTrashLineCount * trashCardsPerRow;
  const newCount = lineCount * trashCardsPerRow;
  const nextCards = trashCards.slice(displayedCount, displayedCount + newCount);

  nextCards.forEach(card => {
    const cardEl = createTrashCardElement(card);
    container.appendChild(cardEl);
  });

  loadedTrashLineCount += lineCount;
}

// スクロール末尾
function onTrashScrollCheck() {
  const scrollC = document.getElementById("trash-card-scroll-container");
  if (!scrollC) return;
  const threshold = 50;
  if (scrollC.scrollTop + scrollC.clientHeight + threshold >= scrollC.scrollHeight) {
    loadNextTrashLines(2);
  }
}

/**
 * ゴミ箱カード：倉庫と同等のデザイン
 * ただしクリック時のプレビューはしない
 */
function createTrashCardElement(card) {
  const cardEl = document.createElement("div");
  cardEl.className = "card rarity" + (card.rarity || "").replace("★", "").trim();
  cardEl.setAttribute("data-id", card.id);

  // 選択モード
  cardEl.addEventListener("click", (e) => {
    if (trashSelectionMode) {
      e.stopPropagation();
      cardEl.classList.toggle("selected");
      updateTrashSelectionButtons();
    }
    // ※ プレビューなし
  });

  const cardInner = document.createElement("div");
  cardInner.className = "card-inner";

  // front
  const cardFront = document.createElement("div");
  cardFront.className = "card-front";
  const bgStyle = (card.backgroundcss || "")
    .replace("background-image:", "")
    .replace("background", "")
    .trim();
  if (bgStyle) {
    cardFront.style.backgroundImage = bgStyle;
  }
  const rarityValue = (card.rarity || "").replace("★", "").trim();
  cardFront.innerHTML = `<div class='bezel rarity${rarityValue}'></div>`;

  const typeEl = document.createElement("div");
  typeEl.className = "card-type";
  typeEl.textContent = card.type || "不明";
  cardFront.appendChild(typeEl);

  const imageContainer = document.createElement("div");
  imageContainer.className = "card-image";
  if (card.imageData) {
    const imgEl = document.createElement("img");
    imgEl.src = card.imageData;
    imgEl.alt = card.name || "";
    imageContainer.appendChild(imgEl);
  }
  cardFront.appendChild(imageContainer);

  const infoContainer = document.createElement("div");
  infoContainer.className = "card-info";

  const nameEl = document.createElement("p");
  nameEl.innerHTML = `<h3>${DOMPurify.sanitize(card.name || "")}</h3>`;
  infoContainer.appendChild(nameEl);

  if (card.state) {
    const stEl = document.createElement("p");
    stEl.innerHTML = `<strong>状態：</strong>${DOMPurify.sanitize(card.state)}`;
    infoContainer.appendChild(stEl);
  }
  if (card.special) {
    const spEl = document.createElement("p");
    spEl.innerHTML = `<strong>特技：</strong>${DOMPurify.sanitize(card.special)}`;
    infoContainer.appendChild(spEl);
  }
  const capEl = document.createElement("p");
  capEl.innerHTML = `<span>${DOMPurify.sanitize(card.caption || "")}</span>`;
  infoContainer.appendChild(capEl);

  cardFront.appendChild(infoContainer);

  // 復元ボタン
  const restoreBtn = document.createElement("button");
  restoreBtn.textContent = "復元";
  restoreBtn.innerHTML = `<span class="iconmoon icon-undo2" style="font-size:1rem"></span>`; 
  restoreBtn.style.position = "absolute";
  restoreBtn.style.right = "40px";
  restoreBtn.style.bottom = "0px";
  restoreBtn.style.minWidth = "35px";
  restoreBtn.style.minHeight = "35px";
  restoreBtn.style.zIndex = "9999"
  restoreBtn.style.width = "35px";
  restoreBtn.style.height = "35px";
  restoreBtn.style.borderRadius = "0";
  restoreBtn.style.backgroundColor = "#4caf50";
  restoreBtn.style.color = "#fff";
  restoreBtn.style.border = "none";
  restoreBtn.style.boxShadow = "inset 0 0 5px #161616";
  restoreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm("このカードを倉庫に戻しますか？")) {
      restoreSingleCard(card.id);
    }
  });
  cardFront.appendChild(restoreBtn);

  // 完全削除ボタン
  const delBtn = document.createElement("button");
  delBtn.title = "完全削除";
  delBtn.innerHTML = `<span class="iconmoon icon-bin" style="font-size:1rem"></span>`; 
  delBtn.style.position = "absolute";
  delBtn.style.right = "0px";
  delBtn.style.bottom = "0px";
  delBtn.style.minWidth = "35px";
  delBtn.style.minHeight = "35px";
  delBtn.style.zIndex = "9999"
  delBtn.style.width = "35px";
  delBtn.style.height = "35px";
  delBtn.style.borderRadius = "0 0 0 4px";
  delBtn.style.backgroundColor = "#f44336";
  delBtn.style.color = "#fff";
  delBtn.style.border = "none";
  delBtn.style.boxShadow = "inset 0 0 5px #161616";
  delBtn.style.boxShadow = "inset 0 0 5px #161616";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm("このカードを完全に削除しますか？")) {
      deleteSingleCardPermanently(card.id);
    }
  });
  cardFront.appendChild(delBtn);

  // back (フリップしないが倉庫と同じ構造)
  const cardBack = document.createElement("div");
  cardBack.className = "card-back";

  cardInner.appendChild(cardFront);
  cardInner.appendChild(cardBack);
  cardEl.appendChild(cardInner);

  return cardEl;
}

function clearTrashSelections() {
  const sel = document.querySelectorAll("#trash-card-container .card.selected");
  sel.forEach(c => c.classList.remove("selected"));
}

function updateTrashSelectionButtons() {
  const sel = document.querySelectorAll("#trash-card-container .card.selected");
  const restoreSelectedBtn = document.getElementById("trash-restore-selected-btn");
  const deleteSelectedBtn = document.getElementById("trash-delete-selected-btn");
  if (!trashSelectionMode) {
    restoreSelectedBtn.style.display = "none";
    deleteSelectedBtn.style.display = "none";
  } else {
    restoreSelectedBtn.style.display = (sel.length > 0) ? "inline-block" : "none";
    deleteSelectedBtn.style.display = (sel.length > 0) ? "inline-block" : "none";
  }
}

// ================== 復元・削除 ==================
async function restoreSelectedTrashCards() {
  const selected = document.querySelectorAll("#trash-card-container .card.selected");
  if (selected.length === 0) {
    showToast("カードが選択されていません。");
    return;
  }
  if (!confirm("選択したカードを倉庫へ戻しますか？")) return;

  selected.forEach(el => {
    const cardId = el.getAttribute("data-id");
    const idx = window.characterData.findIndex(c => c.id === cardId);
    if (idx !== -1) {
      window.characterData[idx].group = "Warehouse";
    }
  });
  await saveCharacterDataToIndexedDB(window.characterData);
  loadTrashCards();
}

async function deleteSelectedTrashCards() {
  const selected = document.querySelectorAll("#trash-card-container .card.selected");
  if (selected.length === 0) {
    showToast("カードが選択されていません。");
    return;
  }
  if (!confirm("選択したカードを完全に削除します。よろしいですか？")) return;

  selected.forEach(el => {
    const cardId = el.getAttribute("data-id");
    const idx = window.characterData.findIndex(c => c.id === cardId);
    if (idx !== -1) {
      window.characterData.splice(idx, 1);
    }
  });
  await saveCharacterDataToIndexedDB(window.characterData);
  loadTrashCards();
}

async function restoreAllTrashCards() {
  window.characterData.forEach(c => {
    if (c.group === "Trash") {
      c.group = "Warehouse";
    }
  });
  await saveCharacterDataToIndexedDB(window.characterData);
  loadTrashCards();
}

async function deleteAllTrashCards() {
  const newArr = window.characterData.filter(c => c.group !== "Trash");
  window.characterData = newArr;
  await saveCharacterDataToIndexedDB(window.characterData);
  loadTrashCards();
}

async function restoreSingleCard(cardId) {
  const idx = window.characterData.findIndex(c => c.id === cardId);
  if (idx === -1) return;
  window.characterData[idx].group = "Warehouse";
  await saveCharacterDataToIndexedDB(window.characterData);
  loadTrashCards();
}

async function deleteSingleCardPermanently(cardId) {
  const idx = window.characterData.findIndex(c => c.id === cardId);
  if (idx === -1) return;
  window.characterData.splice(idx, 1);
  await saveCharacterDataToIndexedDB(window.characterData);
  loadTrashCards();
}
