/************************************************************
 * scenarioWizard.js
 * 
 * 「シナリオ作成ウィザード」用スクリプト
 * 
 * ざっくり以下のステップ：
 *   ステップ0: パーティ選択
 *   ステップ1: ジャンル選択
 *   ステップ2: シナリオタイプ選択
 *   ステップ3: シナリオ要約の確認 → 開始
 * 
 * wizardData にパーティIDやジャンル、シナリオタイプなどを格納し、
 * 最終的に createNewScenario() でDBへ登録 → scenario.html へ遷移
 ************************************************************/

// ウィザード全体で使うデータ
let wizardData = {
  genre: "",
  title: "",
  scenarioType: "",
  clearCondition: "",
  scenarioSummary: "",
  scenarioSummaryEn: "",
  introScene: "",
  party: [],
  partyId: 0,
  currentPartyName: "" // ← 追加: 選択中のパーティ名を保管
};

// 「舞台(複数)・テーマ(単一)・雰囲気(単一)」の一時保存用
let wizStoredStageArr = [];
let wizStoredTheme = "";
let wizStoredMood = "";

// 各カテゴリの「その他」候補
let wizCustomStageChips = [];
let wizCustomThemeChips = [];
let wizCustomMoodChips = [];

let wizardCurrentOtherCategory = "";
let wizardDeletingChipLabel = "";
let wizardDeletingChipCategory = "";

let wizardChoice = ""; // "axis" or "free"

// パーティ一覧を表示するときに使用する配列
let wizardPartyList = [];

// APIキー（scenarioWizardでは localStorage に保存されたキーを読んで使う想定）
window.apiKey = localStorage.getItem("apiKey") || "";

/************************************************************
 * ウィンドウロード時の初期化処理
 ************************************************************/
window.addEventListener("load", async () => {

  // 2) 以前のウィザード状態があれば読み込む
  const storedWizard = await loadWizardDataFromIndexedDB();
  if (storedWizard) {
    wizardData = storedWizard;
  }

  // 3) 軸入力/自由入力チップ関連をセットアップ
  initWizardChips();

  // 4) パーティ一覧をロード＆表示（ステップ0）
  wizardPartyList = await loadAndDisplayPartyList();

  // 5) 各種ボタンのイベント割り当て
  // ステップ0
  document.getElementById("go-wizard-step1-btn").addEventListener("click", onWizardStep0Next);

  // ステップ1
  document.getElementById("back-to-step0-button").addEventListener("click", onBackToStep0);
  document.getElementById("go-step2-btn").addEventListener("click", onGoStep2);

  // ステップ2
  document.getElementById("back-to-step1-button").addEventListener("click", onBackToStep1);
  document.getElementById("type-objective-btn").addEventListener("click", () => onSelectScenarioType("objective"));
  document.getElementById("type-exploration-btn").addEventListener("click", () => onSelectScenarioType("exploration"));
  document.getElementById("confirm-scenario-ok").addEventListener("click", onConfirmScenarioModalOK);
  document.getElementById("confirm-scenario-cancel").addEventListener("click", onConfirmScenarioModalCancel);

  // ステップ3
  document.getElementById("back-to-step2-button").addEventListener("click", onBackToStep2FromStep3);
  document.getElementById("start-scenario-button").addEventListener("click", onStartScenario);

  // ChatGPT応答待ちモーダルのキャンセルボタン
  document.getElementById("cancel-request-button").addEventListener("click", onCancelFetch);

  // 「その他」追加モーダル
  document.getElementById("wizard-other-generate-btn").addEventListener("click", wizardOtherGenerate);
  document.getElementById("wizard-other-ok-btn").addEventListener("click", wizardOtherOk);
  document.getElementById("wizard-other-cancel-btn").addEventListener("click", wizardOtherCancel);

  // 「削除」確認モーダル
  document.getElementById("wizard-delete-confirm-ok").addEventListener("click", wizardDeleteConfirmOk);
  document.getElementById("wizard-delete-confirm-cancel").addEventListener("click", wizardDeleteConfirmCancel);

  // 軸 or 自由入力のトグル
  const axisChip = document.getElementById("choice-axis");
  const freeChip = document.getElementById("choice-free");
  axisChip.addEventListener("click", () => {
    wizardChoice = "axis";
    axisChip.classList.add("selected");
    freeChip.classList.remove("selected");
    enableAxisInput(true);
    enableFreeInput(false);
  });
  freeChip.addEventListener("click", () => {
    wizardChoice = "free";
    freeChip.classList.add("selected");
    axisChip.classList.remove("selected");
    enableAxisInput(false);
    enableFreeInput(true);
  });

  // 初期状態では選択無し
  wizardChoice = "";
  axisChip.classList.remove("selected");
  freeChip.classList.remove("selected");
  enableAxisInput(false);
  enableFreeInput(false);

  // UI更新
  updateSelectedGenreDisplay();
  updateSummaryUI();
});

/************************************************************
 * ステップ0: パーティ選択
 ************************************************************/
/**
 * パーティ一覧を取得してラジオボタンで表示。
 * ここで「あなたの分身」をダミーのパーティ(-1)として先頭に追加
 */
async function loadAndDisplayPartyList() {
  try {
    // ▼ 追加：avatarData(“myAvatar”) を読み込む
    let avatarImageBase64 = "";
    const avatarTx = db.transaction("avatarData", "readonly");
    const avatarStore = avatarTx.objectStore("avatarData");
    const avatarReq = avatarStore.get("myAvatar");
    const avatarData = await new Promise(resolve => {
      avatarReq.onsuccess = () => resolve(avatarReq.result || null);
      avatarReq.onerror = () => resolve(null);
    });
    if (avatarData && avatarData.imageData) {
      avatarImageBase64 = avatarData.imageData;
    }

    // 1) パーティ一覧 & 全カードを取得
    const allParties = await listAllParties();
    const allChars = await loadCharacterDataFromIndexedDB();

    // パーティごとに「カードが1枚以上あるか」をチェック
    const filtered = [];
    for (const p of allParties) {
      const cards = allChars.filter(c => c.group === "Party" && c.partyId === p.partyId);
      if (cards.length < 1) continue; // カード0枚なら非表示

      // アバター画像 or 最初のカード画像
      let mainImage = "";
      const avatarCard = cards.find(c => c.role === "avatar" && c.imageData);
      if (avatarCard) {
        mainImage = avatarCard.imageData;
      } else {
        const firstImgCard = cards.find(c => c.imageData);
        if (firstImgCard) {
          mainImage = firstImgCard.imageData;
        }
      }

      filtered.push({
        partyId: p.partyId,
        name: p.name,
        updatedAt: p.updatedAt || "",
        avatarImage: mainImage
      });
    }
    // 日付が新しい順にソート
    filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    // ▼ 「あなたの分身」を先頭に追加。
    //   avatarImageBase64 が取得できていれば、それを入れる
    const youAvatarAsParty = {
      partyId: -1,
      name: "あなたの分身",
      updatedAt: "",
      avatarImage: avatarImageBase64
    };
    filtered.unshift(youAvatarAsParty);

    // 3) 表示先をクリア
    const container = document.getElementById("wizard-party-list");
    container.innerHTML = "";

    // 4) パーティ一覧を1行ずつ生成
    filtered.forEach(p => {
      const row = document.createElement("div");
      row.className = "wizard-party-row";

      // ラジオボタン input
      const rb = document.createElement("input");
      rb.type = "radio";
      rb.name = "wizardPartyRadio";
      rb.value = p.partyId.toString();

      if (wizardData.partyId === p.partyId) {
        rb.checked = true;
      }

      const uniqueId = "radio-party-" + p.partyId;
      rb.id = uniqueId;

      // ラベル
      const label = document.createElement("label");
      label.className = "wizard-party-label";
      label.setAttribute("for", uniqueId);

      // 画像
      if (p.avatarImage) {
        const img = document.createElement("img");
        img.src = p.avatarImage;
        img.alt = "PartyImage";
        label.appendChild(img);
      } else {
        const noImg = document.createElement("div");
        noImg.className = "no-image-box";
        noImg.textContent = "No Image";
        label.appendChild(noImg);
      }

      // テキスト
      const ymd = p.updatedAt.split("T")[0] || "";
      const infoSpan = document.createElement("span");
      if (p.partyId === -1) {
        // あなたの分身
        infoSpan.textContent = p.name;
      } else {
        infoSpan.textContent = `${p.name} (更新:${ymd})`;
      }
      label.appendChild(infoSpan);

      row.appendChild(rb);
      row.appendChild(label);
      container.appendChild(row);
    });

    // 5) 最後に「パーティなし」を追加
    {
      const row = document.createElement("div");
      row.className = "wizard-party-row";

      const rb = document.createElement("input");
      rb.type = "radio";
      rb.name = "wizardPartyRadio";
      rb.value = "0";
      const uniqueId = "radio-party-none";
      rb.id = uniqueId;

      if (!wizardData.partyId) {
        rb.checked = true;
      }

      const label = document.createElement("label");
      label.className = "wizard-party-label";
      label.setAttribute("for", uniqueId);
      label.textContent = "パーティなし";

      row.appendChild(rb);
      row.appendChild(label);
      container.appendChild(row);
    }

    return filtered;
  } catch (err) {
    console.error("パーティ一覧表示失敗:", err);
  }
}

/** 「次へ」ボタン → 選択されたパーティを wizardData.partyId に保存 */
function onWizardStep0Next() {
  const checked = document.querySelector('input[name="wizardPartyRadio"]:checked');
  if (!checked) {
    alert("パーティを1つ選択してください。");
    return;
  }
  const pid = parseInt(checked.value, 10);
  wizardData.partyId = pid;

  if (pid === 0) {
    // パーティなし
    wizardData.currentPartyName = "パーティなし";
  } else if (pid === -1) {
    // あなたの分身
    wizardData.currentPartyName = "あなたの分身";
  } else {
    // 通常のパーティ
    const chosen = wizardPartyList.find(x => x.partyId === pid);
    if (chosen) {
      wizardData.currentPartyName = chosen.name;
    } else {
      wizardData.currentPartyName = "不明パーティ";
    }
  }

  // DBに保存
  saveWizardDataToIndexedDB(wizardData)
    .catch(e => console.error(e));

  // ステップ0 → ステップ1
  document.getElementById("wizard-step0").style.display = "none";
  document.getElementById("wizard-step1").style.display = "block";
}

function onBackToStep0() {
  document.getElementById("wizard-step1").style.display = "none";
  document.getElementById("wizard-step0").style.display = "block";
}

/************************************************************
 * ステップ1: ジャンル選択（軸選択/自由入力）
 ************************************************************/
/** 軸入力用の初期化 */
function initWizardChips() {
  let stageJson = localStorage.getItem("elementStageArr") || "[]";
  try {
    wizStoredStageArr = JSON.parse(stageJson);
  } catch {
    wizStoredStageArr = [];
  }
  wizStoredTheme = localStorage.getItem("elementTheme") || "";
  wizStoredMood = localStorage.getItem("elementMood") || "";

  wizCustomStageChips = loadWizardCustom("customStageChips");
  wizCustomThemeChips = loadWizardCustom("customThemeChips");
  wizCustomMoodChips = loadWizardCustom("customMoodChips");

  renderWizardStageChips();
  renderWizardThemeChips();
  renderWizardMoodChips();

  updateWizGenreResultText();
}

function loadWizardCustom(key) {
  try {
    const val = localStorage.getItem(key);
    if (!val) return [];
    return JSON.parse(val);
  } catch {
    return [];
  }
}

/** 軸入力の「舞台(複数)」を表示 */
function renderWizardStageChips() {
  const defaults = ["ファンタジー", "SF", "歴史・時代劇", "現代", "ホラー / ダーク"];
  const container = document.getElementById("wiz-stage-chips-container");
  if (!container) return;
  container.innerHTML = "";

  const all = [...defaults, ...wizCustomStageChips, "その他"];
  all.forEach(label => {
    const chip = createWizardChip(label, "stage");
    container.appendChild(chip);
  });
}

/** 軸入力の「テーマ(単一)」を表示 */
function renderWizardThemeChips() {
  const defaults = [
    "アクション / 冒険",
    "ミステリー / サスペンス",
    "ロマンス / ドラマ",
    "コメディ / ほのぼの",
    "ホラー / スリラー"
  ];
  const container = document.getElementById("wiz-theme-chips-container");
  if (!container) return;
  container.innerHTML = "";

  const all = [...defaults, ...wizCustomThemeChips, "その他"];
  all.forEach(label => {
    const chip = createWizardChip(label, "theme");
    container.appendChild(chip);
  });
}

/** 軸入力の「雰囲気(単一)」を表示 */
function renderWizardMoodChips() {
  const defaults = ["ライト / ポップ", "中間 / バランス型", "ダーク / シリアス"];
  const container = document.getElementById("wiz-mood-chips-container");
  if (!container) return;
  container.innerHTML = "";

  const all = [...defaults, ...wizCustomMoodChips, "その他"];
  all.forEach(label => {
    const chip = createWizardChip(label, "mood");
    container.appendChild(chip);
  });
}

/** 軸入力用のchip生成 */
function createWizardChip(label, category) {
  const chip = document.createElement("div");
  chip.className = "chip";
  chip.textContent = label;

  const isOther = (label === "その他");
  // 既存選択を反映
  if (category === "stage") {
    if (wizStoredStageArr.includes(label)) {
      chip.classList.add("selected");
    }
  } else if (category === "theme") {
    if (wizStoredTheme === label) {
      chip.classList.add("selected");
    }
  } else if (category === "mood") {
    if (wizStoredMood === label) {
      chip.classList.add("selected");
    }
  }

  chip.addEventListener("click", () => {
    if (!canEditAxisInput()) return; // 軸入力モードでなければ無視

    // 「その他」を押したらモーダルを出す
    if (isOther) {
      openWizardOtherModal(category);
      return;
    }

    if (category === "stage") {
      // 複数選択可
      if (chip.classList.contains("selected")) {
        chip.classList.remove("selected");
        wizStoredStageArr = wizStoredStageArr.filter(x => x !== label);
      } else {
        chip.classList.add("selected");
        wizStoredStageArr.push(label);
      }
      localStorage.setItem("elementStageArr", JSON.stringify(wizStoredStageArr));

    } else if (category === "theme") {
      // 単一選択
      const allChips = document.getElementById("wiz-theme-chips-container").querySelectorAll(".chip");
      allChips.forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
      wizStoredTheme = label;
      localStorage.setItem("elementTheme", wizStoredTheme);

    } else if (category === "mood") {
      // 単一選択
      const allChips = document.getElementById("wiz-mood-chips-container").querySelectorAll(".chip");
      allChips.forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
      wizStoredMood = label;
      localStorage.setItem("elementMood", wizStoredMood);
    }

    updateWizGenreResultText();
  });

  // カスタムチップ削除ボタン
  if (!isOther) {
    if (
      (category === "stage" && wizCustomStageChips.includes(label)) ||
      (category === "theme" && wizCustomThemeChips.includes(label)) ||
      (category === "mood" && wizCustomMoodChips.includes(label))
    ) {
      addWizardRemoveButton(chip, label, category);
    }
  }

  return chip;
}

function addWizardRemoveButton(chip, label, category) {
  const span = document.createElement("span");
  span.textContent = "×";
  span.style.marginLeft = "4px";
  span.style.cursor = "pointer";
  span.style.color = "red";
  span.addEventListener("click", (ev) => {
    ev.stopPropagation();
    wizardDeletingChipLabel = label;
    wizardDeletingChipCategory = category;
    document.getElementById("wizard-delete-confirm-modal").classList.add("active");
  });
  chip.appendChild(span);
}

/** 軸入力を有効/無効にする */
function enableAxisInput(flag) {
  const group = document.getElementById("axis-input-group");
  if (!group) return;
  if (flag) {
    group.style.display = "block";
    group.style.pointerEvents = "auto";
    group.style.opacity = "1.0";
  } else {
    group.style.display = "none";
    group.style.pointerEvents = "none";
    group.style.opacity = "0.2";
  }
}

/** 自由入力を有効/無効にする */
function enableFreeInput(flag) {
  const group = document.getElementById("free-input-group");
  if (!group) return;
  if (flag) {
    group.style.display = "block";
    group.style.pointerEvents = "auto";
    group.style.opacity = "1.0";
  } else {
    group.style.display = "none";
    group.style.pointerEvents = "none";
    group.style.opacity = "0.2";
  }
}

/** 軸入力モードでなければチップ操作禁止 */
function canEditAxisInput() {
  return (wizardChoice === "axis");
}

function openWizardOtherModal(category) {
  wizardCurrentOtherCategory = category;
  let catText = "";
  if (category === "stage") catText = "舞台に追加する「その他」";
  else if (category === "theme") catText = "テーマに追加する「その他」";
  else catText = "雰囲気に追加する「その他」";

  document.getElementById("wizard-other-input-modal-category").textContent = catText;
  document.getElementById("wizard-other-input-text").value = "";
  document.getElementById("wizard-other-input-modal").classList.add("active");
}

function wizardOtherGenerate() {
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }
  let existingList = [];
  if (wizardCurrentOtherCategory === "stage") {
    existingList = ["ファンタジー", "SF", "歴史・時代劇", "現代", "ホラー / ダーク", ...wizCustomStageChips];
  } else if (wizardCurrentOtherCategory === "theme") {
    existingList = [
      "アクション / 冒険",
      "ミステリー / サスペンス",
      "ロマンス / ドラマ",
      "コメディ / ほのぼの",
      "ホラー / スリラー",
      ...wizCustomThemeChips
    ];
  } else if (wizardCurrentOtherCategory === "mood") {
    existingList = ["ライト / ポップ", "中間 / バランス型", "ダーク / シリアス", ...wizCustomMoodChips];
  }

  showLoadingModal(true);
  (async () => {
    try {
      const systemPrompt = "あなたは創造力豊かなアシスタントです。回答は1つだけ。";
      const userPrompt = `既存候補:${existingList.join(" / ")}\nこれらに無い新しい案を1つ提案してください。`;

      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${window.apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.7
        })
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message);

      const newCandidate = (data.choices[0].message.content || "").trim();
      document.getElementById("wizard-other-input-text").value = newCandidate;
    } catch (err) {
      console.error(err);
      alert("その他生成失敗:\n" + err.message);
    } finally {
      showLoadingModal(false);
    }
  })();
}

function wizardOtherOk() {
  const val = document.getElementById("wizard-other-input-text").value.trim();
  document.getElementById("wizard-other-input-modal").classList.remove("active");
  if (!val) return;

  if (wizardCurrentOtherCategory === "stage") {
    if (!wizCustomStageChips.includes(val)) {
      wizCustomStageChips.push(val);
      localStorage.setItem("customStageChips", JSON.stringify(wizCustomStageChips));
    }
    renderWizardStageChips();
  } else if (wizardCurrentOtherCategory === "theme") {
    if (!wizCustomThemeChips.includes(val)) {
      wizCustomThemeChips.push(val);
      localStorage.setItem("customThemeChips", JSON.stringify(wizCustomThemeChips));
    }
    renderWizardThemeChips();
  } else if (wizardCurrentOtherCategory === "mood") {
    if (!wizCustomMoodChips.includes(val)) {
      wizCustomMoodChips.push(val);
      localStorage.setItem("customMoodChips", JSON.stringify(wizCustomMoodChips));
    }
    renderWizardMoodChips();
  }
  updateWizGenreResultText();
}

function wizardOtherCancel() {
  document.getElementById("wizard-other-input-modal").classList.remove("active");
}

function wizardDeleteConfirmOk() {
  if (wizardDeletingChipCategory === "stage") {
    wizCustomStageChips = wizCustomStageChips.filter(c => c !== wizardDeletingChipLabel);
    localStorage.setItem("customStageChips", JSON.stringify(wizCustomStageChips));
    wizStoredStageArr = wizStoredStageArr.filter(s => s !== wizardDeletingChipLabel);
    localStorage.setItem("elementStageArr", JSON.stringify(wizStoredStageArr));
    renderWizardStageChips();
  } else if (wizardDeletingChipCategory === "theme") {
    wizCustomThemeChips = wizCustomThemeChips.filter(c => c !== wizardDeletingChipLabel);
    localStorage.setItem("customThemeChips", JSON.stringify(wizCustomThemeChips));
    if (wizStoredTheme === wizardDeletingChipLabel) {
      wizStoredTheme = "";
      localStorage.setItem("elementTheme", "");
    }
    renderWizardThemeChips();
  } else if (wizardDeletingChipCategory === "mood") {
    wizCustomMoodChips = wizCustomMoodChips.filter(c => c !== wizardDeletingChipLabel);
    localStorage.setItem("customMoodChips", JSON.stringify(wizCustomMoodChips));
    if (wizStoredMood === wizardDeletingChipLabel) {
      wizStoredMood = "";
      localStorage.setItem("elementMood", "");
    }
    renderWizardMoodChips();
  }

  document.getElementById("wizard-delete-confirm-modal").classList.remove("active");
  wizardDeletingChipLabel = "";
  wizardDeletingChipCategory = "";
  updateWizGenreResultText();
}

function wizardDeleteConfirmCancel() {
  document.getElementById("wizard-delete-confirm-modal").classList.remove("active");
  wizardDeletingChipLabel = "";
  wizardDeletingChipCategory = "";
}

function updateWizGenreResultText() {
  const st = wizStoredStageArr.length ? `【舞台】${wizStoredStageArr.join("/")}` : "";
  const th = wizStoredTheme ? `【テーマ】${wizStoredTheme}` : "";
  const md = wizStoredMood ? `【雰囲気】${wizStoredMood}` : "";
  const joined = st + th + md || "（未設定）";
  document.getElementById("wiz-genre-result-text").textContent = joined;
}

/************************************************************
 * ステップ1 → ステップ2
 ************************************************************/
function onGoStep2() {
  if (!wizardChoice) {
    alert("「選択して入力」か「自由入力」を選んでください。");
    return;
  }

  if (wizardChoice === "axis") {
    // 軸入力モード
    const result = buildChipsGenre();
    if (!result) {
      alert("舞台・テーマ・雰囲気のいずれかは入力してください。");
      return;
    }
    wizardData.genre = result;
  } else {
    // 自由入力モード
    const freeVal = document.getElementById("free-genre-input").value.trim();
    if (!freeVal) {
      alert("自由入力ジャンルを入力してください。");
      return;
    }
    wizardData.genre = freeVal;
  }

  saveWizardDataToIndexedDB(wizardData)
    .catch(e => console.error(e));

  // 画面遷移
  document.getElementById("wizard-step1").style.display = "none";
  document.getElementById("wizard-step2").style.display = "block";

  updateSelectedPartyDisplay();
  updateSelectedGenreDisplay();
}

function buildChipsGenre() {
  let stagePart = "";
  if (wizStoredStageArr.length > 0) {
    stagePart = "【舞台】" + wizStoredStageArr.join("/");
  }
  const themePart = wizStoredTheme ? "【テーマ】" + wizStoredTheme : "";
  const moodPart = wizStoredMood ? "【雰囲気】" + wizStoredMood : "";
  return stagePart + themePart + moodPart;
}

function onBackToStep1() {
  document.getElementById("wizard-step2").style.display = "none";
  document.getElementById("wizard-step1").style.display = "block";
}

function updateSelectedPartyDisplay() {
  const el = document.getElementById("selected-party-display");
  if (!el) return;
  el.textContent = wizardData.currentPartyName || "(未選択)";
}

function updateSelectedGenreDisplay() {
  const el = document.getElementById("selected-genre-display");
  if (el) {
    el.textContent = wizardData.genre || "（未選択）";
  }
}

/************************************************************
 * ステップ2: シナリオタイプ選択 → 確認モーダル
 ************************************************************/
function onSelectScenarioType(type) {
  wizardData.scenarioType = type;
  saveWizardDataToIndexedDB(wizardData).catch(e => console.error(e));

  const typeLabel = (type === "objective") ? "目的達成型" : "探索型";

  // パーティ表示
  const partyEl = document.getElementById("confirm-party-text");
  if (partyEl) {
    partyEl.textContent = "パーティ: " + (wizardData.currentPartyName || "(未選択)");
  }

  // ジャンル + シナリオタイプ表示
  const confirmText = `ジャンル: ${wizardData.genre}\nシナリオタイプ: ${typeLabel}`;
  document.getElementById("confirm-genre-type-text").textContent = confirmText;

  // モーダルを開く
  document.getElementById("confirm-scenario-modal").classList.add("active");
}

function onConfirmScenarioModalCancel() {
  document.getElementById("confirm-scenario-modal").classList.remove("active");
}

/** 確認モーダル「OK」→ シナリオ生成処理 */
async function onConfirmScenarioModalOK() {
  showLoadingModal(true);
  document.getElementById("confirm-scenario-modal").classList.remove("active");

  try {
    // 1) パーティ情報を wizardData に反映
    await storePartyInWizardData();

    // 2) シナリオ概要を生成（+ クリア条件や英訳など）
    if (wizardData.scenarioType === "objective") {
      await generateScenarioSummaryAndClearCondition();
    } else {
      await generateScenarioSummary();
    }
    await generateScenarioSummaryEn();

    // 3) セクション生成
    await generateSections();

    // 4) 導入シーン生成
    await generateIntroScene();

    // 5) ステップ2→3
    document.getElementById("wizard-step2").style.display = "none";
    document.getElementById("wizard-step3").style.display = "block";
    updateSummaryUI();

  } catch (err) {
    console.error(err);
    alert("シナリオ生成に失敗しました:\n" + err.message);
  } finally {
    showLoadingModal(false);
  }
}

/**
 * パーティデータを wizardData.party に反映。
 *  - partyId=0 → パーティなし
 *  - partyId=-1 → あなたの分身
 *  - それ以外 → 通常パーティ
 */
async function storePartyInWizardData() {
  const pid = wizardData.partyId || 0;

  if (pid === 0) {
    // パーティなし
    wizardData.party = [];
    await saveWizardDataToIndexedDB(wizardData);
    return;
  }

  if (pid === -1) {
    // ▼ あなたの分身 → avatarDataストアから読み出し
    const avatarObj = await loadMyAvatarData();
    if (avatarObj) {
      // アバターをパーティのカード風に変換
      const card = convertAvatarToPartyCard(avatarObj);
      wizardData.party = [card];
    } else {
      // アバターが未保存の場合
      wizardData.party = [];
    }
    await saveWizardDataToIndexedDB(wizardData);
    return;
  }

  // ▼ 通常のパーティ
  const allChars = await loadCharacterDataFromIndexedDB();
  if (!allChars) {
    wizardData.party = [];
    await saveWizardDataToIndexedDB(wizardData);
    return;
  }
  const partyCards = allChars.filter(c => c.group === "Party" && c.partyId === pid);

  // 軽量化のため一部フィールドだけ保持
  const stripped = partyCards.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    rarity: c.rarity,
    state: c.state,
    special: c.special,
    caption: c.caption,
    backgroundcss: c.backgroundcss,
    imageprompt: c.imageprompt,
    role: c.role,
    // 画像を仮に付ける
    imageData: c.imageData
  }));
  wizardData.party = stripped;
  await saveWizardDataToIndexedDB(wizardData);
}

/** avatarDataストアから「myAvatar」を読み込み */
function loadMyAvatarData() {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.warn("DB未初期化です");
      resolve(null);
      return;
    }
    const tx = db.transaction("avatarData", "readonly");
    const store = tx.objectStore("avatarData");
    const req = store.get("myAvatar");
    req.onsuccess = (evt) => {
      resolve(evt.target.result || null);
    };
    req.onerror = (err) => {
      console.error("avatarData読み込み失敗:", err);
      resolve(null);
    };
  });
}

/** avatarObj → wizardData.party の1カードに落とし込む */
function convertAvatarToPartyCard(avatarObj) {
  // avatarObjの構造例：
  // {
  //   id: "myAvatar",
  //   name: "名前",
  //   gender: "男",
  //   skill: "特技",
  //   serif: "セリフ",
  //   rarity: "★2",
  //   imageData: "data:image/png;base64,...",
  //   ...
  // }
  return {
    // DBのキャラIDでなくアバター専用の一時ID
    id: "avatar-" + Date.now(),
    name: avatarObj.name || "アバター",
    type: "キャラクター", // あるいは"アバター"など
    rarity: avatarObj.rarity || "★1",
    state: "",
    special: avatarObj.skill || "",
    caption: avatarObj.serif || "",
    backgroundcss: "",
    imageprompt: "",
    role: "avatar",
    imageData: avatarObj.imageData || ""
  };
}

/************************************************************
 * シナリオ生成関連
 ************************************************************/
async function generateScenarioSummaryAndClearCondition() {
  if (!window.apiKey) {
    wizardData.scenarioSummary = "(APIキー無し)";
    wizardData.clearCondition = "(なし)";
    return;
  }
  const prompt = `
あなたはTRPG用のシナリオ作成に長けたアシスタントです。
ジャンル:${wizardData.genre}, タイプ:目的達成型。
1) シナリオ概要(短め, 背景黒想定で飾りタグOK)
2) 【クリア条件】(非公開)
`;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "あなたは優秀なTRPGシナリオメーカーです。日本語で回答。" },
          { role: "user", content: prompt }
        ]
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.choices[0].message.content || "";
    if (text.includes("【クリア条件】")) {
      const arr = text.split("【クリア条件】");
      wizardData.scenarioSummary = arr[0].trim();
      wizardData.clearCondition = (arr[1] || "").trim();
    } else {
      wizardData.scenarioSummary = text;
      wizardData.clearCondition = "";
    }
    await saveWizardDataToIndexedDB(wizardData);
  } catch (err) {
    console.error(err);
    wizardData.scenarioSummary = "(生成エラー)";
    wizardData.clearCondition = "(なし)";
    await saveWizardDataToIndexedDB(wizardData);
  }
}

async function generateScenarioSummary() {
  if (!window.apiKey) {
    wizardData.scenarioSummary = "(APIキー無し)";
    return;
  }
  const prompt = `
ジャンル:${wizardData.genre}, タイプ:探索型。
短めで背景黒想定の飾りタグ付きのシナリオ概要を作ってください。
`;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "あなたは優秀なTRPGシナリオメーカー、日本語で回答。" },
          { role: "user", content: prompt }
        ]
      })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    wizardData.scenarioSummary = d.choices[0].message.content || "(概要なし)";
    await saveWizardDataToIndexedDB(wizardData);
  } catch (err) {
    console.error(err);
    wizardData.scenarioSummary = "(生成エラー)";
    await saveWizardDataToIndexedDB(wizardData);
  }
}

async function generateScenarioSummaryEn() {
  if (!window.apiKey) return;
  const jp = wizardData.scenarioSummary || "";
  if (!jp.trim()) return;

  try {
    const prompt = "以下の日本語テキストをTRPGシナリオ概要として自然な英文にしてください:\n" + jp;
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "あなたは優秀な翻訳家です。" },
          { role: "user", content: prompt }
        ]
      })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    wizardData.scenarioSummaryEn = d.choices[0].message.content || "";
    await saveWizardDataToIndexedDB(wizardData);
  } catch (err) {
    console.error(err);
    wizardData.scenarioSummaryEn = "";
    await saveWizardDataToIndexedDB(wizardData);
  }
}

async function generateSections() {
  if (!window.apiKey) {
    wizardData.sections = [];
    for (let i = 1; i <= 3; i++) {
      wizardData.sections.push({
        number: i,
        conditionZipped: btoa("セクション" + i + "ダミー"),
        cleared: false
      });
    }
    await saveWizardDataToIndexedDB(wizardData);
    return;
  }

  const count = Math.floor(Math.random() * 4) + 2; // 2～5
  const prompt = `
ジャンル:${wizardData.genre}, シナリオタイプ:${wizardData.scenarioType}用のセクション達成条件を${count}個。
1行に1個。必ず動詞で始める形にしてください。
`;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "あなたはTRPGセクション目標を考えるエキスパートです。" },
          { role: "user", content: prompt }
        ]
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const lines = (data.choices[0].message.content || "").split("\n").map(l => l.trim()).filter(l => l);
    wizardData.sections = [];
    for (let i = 0; i < count; i++) {
      const textLine = lines[i] || `「セクション${i + 1}」をクリアする`;
      const zipped = zipString(textLine);
      wizardData.sections.push({
        number: i + 1,
        conditionZipped: zipped,
        cleared: false
      });
    }
    await saveWizardDataToIndexedDB(wizardData);
  } catch (err) {
    console.error(err);
    wizardData.sections = [];
    for (let i = 1; i <= count; i++) {
      wizardData.sections.push({
        number: i,
        conditionZipped: btoa("セクション" + i + "ダミー(エラー時)"),
        cleared: false
      });
    }
    await saveWizardDataToIndexedDB(wizardData);
  }
}

function zipString(str) {
  const utf8 = new TextEncoder().encode(str);
  const def = pako.deflate(utf8);
  return btoa(String.fromCharCode(...def));
}

async function generateIntroScene() {
  if (!window.apiKey) {
    wizardData.introScene = "(導入生成失敗：APIキーなし)";
    await saveWizardDataToIndexedDB(wizardData);
    return;
  }
  const prompt = `
次のシナリオ概要を踏まえて、導入シーンを300字程度で作ってください。
背景黒想定の飾りタグ(h3,br,p style="color:aqua"など)を適度に使う。
概要:
${wizardData.scenarioSummary}
`;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "あなたは優秀なTRPGシナリオライターです。日本語で回答。" },
          { role: "user", content: prompt }
        ]
      })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    wizardData.introScene = d.choices[0].message.content || "(導入空)";
    await saveWizardDataToIndexedDB(wizardData);
  } catch (err) {
    console.error(err);
    wizardData.introScene = "(導入生成失敗)";
    await saveWizardDataToIndexedDB(wizardData);
  }
}

/************************************************************
 * ステップ3: シナリオ要約の表示
 ************************************************************/
function onBackToStep2FromStep3() {
  document.getElementById("wizard-step3").style.display = "none";
  document.getElementById("wizard-step2").style.display = "block";
}

async function onStartScenario() {
  try {
    // 1) シナリオタイトル自動生成など
    wizardData.title = await generateScenarioTitle(wizardData.scenarioSummary);

    // 2) DBに追加
    const scenarioId = await createNewScenario(wizardData, wizardData.title);

    // 3) 導入シーンあれば sceneEntries に追加
    if (wizardData.introScene.trim()) {
      const firstScene = {
        scenarioId,
        type: "scene",
        sceneId: "intro_" + Date.now(),
        content: wizardData.introScene,
        content_en: "", // 必要ならあとで翻訳
        prompt: ""      // 必要ならあとで画像用プロンプトを生成
      };
      await addSceneEntry(firstScene);
    }

    // 4) scenario.html に移動
    window.location.href = `scenario.html?scenarioId=${scenarioId}`;
  } catch (err) {
    console.error("シナリオ開始失敗:", err);
    alert("シナリオ開始に失敗: " + err.message);
  }
}

/** シナリオ概要からタイトルを作成 */
async function generateScenarioTitle(summary) {
  if (!window.apiKey || !summary.trim()) {
    return "新シナリオ";
  }
  const prompt = `
以下のシナリオ概要から良さげなタイトルを1つ生成してください。
括弧書きや、「シナリオタイトル：」のような接頭文字は不要です。
概要:
${summary}
`;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "あなたは優秀なTRPGシナリオタイトル生成アシスタントです。" },
          { role: "user", content: prompt }
        ]
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    const t = data.choices[0].message.content.trim();
    return t || "新シナリオ";
  } catch {
    return "新シナリオ";
  }
}

/************************************************************
 * UIヘルパー
 ************************************************************/
function updateSummaryUI() {
  const el = document.getElementById("scenario-summary");
  if (!el) return;
  const sanitized = DOMPurify.sanitize(wizardData.scenarioSummary || "(未生成)");
  el.innerHTML = sanitized;
}

function showLoadingModal(show) {
  const m = document.getElementById("loading-modal");
  if (!m) return;
  if (show) {
    m.classList.add("active");
  } else {
    m.classList.remove("active");
  }
}

/** ChatGPTリクエストのキャンセルボタン */
function onCancelFetch() {
  showLoadingModal(false);
  // 必要なら fetch の AbortController を呼ぶ等
}

window.addEventListener("DOMContentLoaded", async () => {
  // 1) IndexedDBを初期化
  await initIndexedDB();
  await initBackground("scenarioWizard");

  document.getElementById("back-to-menu").addEventListener("click", () => {
    window.location.href = "index.html";
  });
});