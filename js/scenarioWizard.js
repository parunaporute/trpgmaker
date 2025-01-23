// scenarioWizard.js

let wizardData = {
  genre: "",           // 「【舞台】...【テーマ】...【雰囲気】...」 or 自由入力
  scenarioType: "",    // "objective" or "exploration"
  clearCondition: "",
  scenarioSummary: "",
  introScene: "",
  party: [],
  partyId: 0,          // ★追加: 紐づけるパーティID
  sections: []
};

// 舞台(複数), テーマ(単一), 雰囲気(単一)
let wizStoredStageArr = [];
let wizStoredTheme = "";
let wizStoredMood = "";

// カスタムチップ
let wizCustomStageChips = [];
let wizCustomThemeChips = [];
let wizCustomMoodChips = [];

// 「その他」モーダル操作中
let wizardCurrentOtherCategory = "";
// 削除モーダル操作中
let wizardDeletingChipLabel = "";
let wizardDeletingChipCategory = "";

// 軸選択 or 自由入力 の選択状態 ("axis" | "free" | "")
let wizardChoice = "";

window.apiKey = localStorage.getItem("apiKey") || "";

window.addEventListener("load", async function () {
  // IndexedDB初期化
  await initIndexedDB();

  // 既存wizardDataあればロード
  const storedWizard = await loadWizardDataFromIndexedDB();
  if (storedWizard) {
    wizardData = storedWizard;
  }

  initWizardChips();

  // Stepボタン
  document.getElementById("go-step2-btn").addEventListener("click", onGoStep2);
  document.getElementById("back-to-step1-button").addEventListener("click", onBackToStep1);
  document.getElementById("back-to-step2-button").addEventListener("click", onBackToStep2FromStep3);
  document.getElementById("start-scenario-button").addEventListener("click", onStartScenario);

  document.getElementById("type-objective-btn").addEventListener("click", () => onSelectScenarioType("objective"));
  document.getElementById("type-exploration-btn").addEventListener("click", () => onSelectScenarioType("exploration"));

  document.getElementById("confirm-scenario-ok").addEventListener("click", onConfirmScenarioModalOK);
  document.getElementById("confirm-scenario-cancel").addEventListener("click", onConfirmScenarioModalCancel);

  const cancelReqBtn = document.getElementById("cancel-request-button");
  if (cancelReqBtn) {
    cancelReqBtn.addEventListener("click", onCancelFetch);
  }

  // 「その他」モーダルのボタン
  document.getElementById("wizard-other-generate-btn").addEventListener("click", wizardOtherGenerate);
  document.getElementById("wizard-other-ok-btn").addEventListener("click", wizardOtherOk);
  document.getElementById("wizard-other-cancel-btn").addEventListener("click", wizardOtherCancel);

  // 「削除」確認モーダルのボタン
  document.getElementById("wizard-delete-confirm-ok").addEventListener("click", wizardDeleteConfirmOk);
  document.getElementById("wizard-delete-confirm-cancel").addEventListener("click", wizardDeleteConfirmCancel);

  // ▼ 軸or自由入力のチップにイベント付与
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

  // 初期状態は未選択
  wizardChoice = "";
  axisChip.classList.remove("selected");
  freeChip.classList.remove("selected");
  enableAxisInput(false);
  enableFreeInput(false);

  updateSelectedGenreDisplay();
  updateSummaryUI();
});

/** 軸入力を有効/無効にする */
function enableAxisInput(flag) {
  const group = document.getElementById("axis-input-group");
  if (!group) return;
  if (flag) {
    group.style.opacity = "1.0";
    group.style.display = "block";
    group.style.pointerEvents = "auto";
  } else {
    group.style.opacity = "0.2";
    group.style.display = "none";
    group.style.pointerEvents = "none";
  }
}

/** 自由入力を有効/無効にする */
function enableFreeInput(flag) {
  const group = document.getElementById("free-input-group");
  if (!group) return;
  if (flag) {
    group.style.opacity = "1.0";
    group.style.display = "block";
    group.style.pointerEvents = "auto";
  } else {
    group.style.opacity = "0.2";
    group.style.display = "none";
    group.style.pointerEvents = "none";
  }
}

function initWizardChips() {
  // localStorage 読み込み
  const sjson = localStorage.getItem("elementStageArr");
  if (sjson) {
    try {
      wizStoredStageArr = JSON.parse(sjson);
    } catch (e) {
      wizStoredStageArr = [];
    }
  } else {
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
    const j = localStorage.getItem(key);
    if (!j) return [];
    return JSON.parse(j);
  } catch (e) {
    return [];
  }
}

// 舞台(複数)
function renderWizardStageChips() {
  const defaultList = ["ファンタジー", "SF", "歴史・時代劇", "現代", "ホラー / ダーク"];
  const container = document.getElementById("wiz-stage-chips-container");
  if (!container) return;
  container.innerHTML = "";

  const all = [...defaultList, ...wizCustomStageChips, "その他"];
  all.forEach(label => {
    const chip = createWizardChip(label, "stage");
    container.appendChild(chip);
  });
}

// テーマ(単一)
function renderWizardThemeChips() {
  const defaultList = [
    "アクション / 冒険",
    "ミステリー / サスペンス",
    "ロマンス / ドラマ",
    "コメディ / ほのぼの",
    "ホラー / スリラー"
  ];
  const container = document.getElementById("wiz-theme-chips-container");
  if (!container) return;
  container.innerHTML = "";

  const all = [...defaultList, ...wizCustomThemeChips, "その他"];
  all.forEach(label => {
    const chip = createWizardChip(label, "theme");
    container.appendChild(chip);
  });
}

// 雰囲気(単一)
function renderWizardMoodChips() {
  const defaultList = ["ライト / ポップ", "中間 / バランス型", "ダーク / シリアス"];
  const container = document.getElementById("wiz-mood-chips-container");
  if (!container) return;
  container.innerHTML = "";

  const all = [...defaultList, ...wizCustomMoodChips, "その他"];
  all.forEach(label => {
    const chip = createWizardChip(label, "mood");
    container.appendChild(chip);
  });
}

function createWizardChip(label, category) {
  const isOther = (label === "その他");
  const chip = document.createElement("div");
  chip.className = "chip";
  chip.textContent = label;

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
    if (!canEditAxisInput()) return; // 軸入力が無効な場合はクリックしても反応しない
    if (isOther) {
      openWizardOtherModal(category);
      return;
    }

    if (category === "stage") {
      // 複数トグル
      if (chip.classList.contains("selected")) {
        chip.classList.remove("selected");
        wizStoredStageArr = wizStoredStageArr.filter(x => x !== label);
      } else {
        chip.classList.add("selected");
        wizStoredStageArr.push(label);
      }
      localStorage.setItem("elementStageArr", JSON.stringify(wizStoredStageArr));
    } else if (category === "theme") {
      // 単一
      if (chip.classList.contains("selected")) {
        chip.classList.remove("selected");
        wizStoredTheme = "";
        localStorage.setItem("elementTheme", "");
      } else {
        const cont = document.getElementById("wiz-theme-chips-container");
        const all = cont.querySelectorAll(".chip");
        all.forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        wizStoredTheme = label;
        localStorage.setItem("elementTheme", wizStoredTheme);
      }
    } else if (category === "mood") {
      // 単一
      if (chip.classList.contains("selected")) {
        chip.classList.remove("selected");
        wizStoredMood = "";
        localStorage.setItem("elementMood", "");
      } else {
        const cont = document.getElementById("wiz-mood-chips-container");
        const all = cont.querySelectorAll(".chip");
        all.forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        wizStoredMood = label;
        localStorage.setItem("elementMood", wizStoredMood);
      }
    }
    updateWizGenreResultText();
  });

  // カスタム削除
  if (!isOther) {
    if (category === "stage" && wizCustomStageChips.includes(label)) {
      addWizardRemoveButton(chip, label, "stage");
    } else if (category === "theme" && wizCustomThemeChips.includes(label)) {
      addWizardRemoveButton(chip, label, "theme");
    } else if (category === "mood" && wizCustomMoodChips.includes(label)) {
      addWizardRemoveButton(chip, label, "mood");
    }
  }

  return chip;
}

/** 軸入力が有効なときのみチップを操作できるようにするための判定 */
function canEditAxisInput() {
  return (wizardChoice === "axis");
}

function addWizardRemoveButton(chip, label, category) {
  const span = document.createElement("span");
  span.textContent = "×";
  span.style.marginLeft = "4px";
  span.style.cursor = "pointer";
  span.style.color = "red";
  span.addEventListener("click", (e) => {
    e.stopPropagation();
    wizardDeletingChipLabel = label;
    wizardDeletingChipCategory = category;
    document.getElementById("wizard-delete-confirm-modal").style.display = "flex";
  });
  chip.appendChild(span);
}

function openWizardOtherModal(category) {
  wizardCurrentOtherCategory = category;
  const catText =
    (category === "stage") ? "舞台に追加する「その他」" :
      (category === "theme") ? "テーマに追加する「その他」" :
        "雰囲気に追加する「その他」";

  document.getElementById("wizard-other-input-modal-category").textContent = catText;
  document.getElementById("wizard-other-input-text").value = "";
  document.getElementById("wizard-other-input-modal").style.display = "flex";
}

async function wizardOtherGenerate() {
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
}

function wizardOtherOk() {
  const val = document.getElementById("wizard-other-input-text").value.trim();
  if (!val) {
    document.getElementById("wizard-other-input-modal").style.display = "none";
    return;
  }

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

  document.getElementById("wizard-other-input-modal").style.display = "none";
  updateWizGenreResultText();
}

function wizardOtherCancel() {
  document.getElementById("wizard-other-input-modal").style.display = "none";
}

function wizardDeleteConfirmOk() {
  if (wizardDeletingChipCategory === "stage") {
    wizCustomStageChips = wizCustomStageChips.filter(c => c !== wizardDeletingChipLabel);
    localStorage.setItem("customStageChips", JSON.stringify(wizCustomStageChips));
    wizStoredStageArr = wizStoredStageArr.filter(x => x !== wizardDeletingChipLabel);
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
  wizardDeletingChipLabel = "";
  wizardDeletingChipCategory = "";
  document.getElementById("wizard-delete-confirm-modal").style.display = "none";
  updateWizGenreResultText();
}

function wizardDeleteConfirmCancel() {
  wizardDeletingChipLabel = "";
  wizardDeletingChipCategory = "";
  document.getElementById("wizard-delete-confirm-modal").style.display = "none";
}

function updateWizGenreResultText() {
  let stagePart = (wizStoredStageArr.length > 0) ? "【舞台】" + wizStoredStageArr.join("/") : "";
  let themePart = wizStoredTheme ? "【テーマ】" + wizStoredTheme : "";
  let moodPart = wizStoredMood ? "【雰囲気】" + wizStoredMood : "";
  let result = stagePart + themePart + moodPart;
  if(result == "") result = "テーマは選択されていません";
  document.getElementById("wiz-genre-result-text").textContent = result;
}

/* STEP1 -> STEP2 */
async function onGoStep2() {
  // 軸 or 自由入力 の選択必須
  if (!wizardChoice) {
    alert("「選択して入力」か「自由入力」を選んでください。");
    return;
  }

  if (wizardChoice === "axis") {
    const result = buildChipsGenre();
    if (!result) {
      alert("舞台・テーマ・雰囲気のどれかを入力してください。");
      return;
    }
    wizardData.genre = result;
  } else {
    // "free"の場合
    const freeVal = document.getElementById("free-genre-input").value.trim();
    if (!freeVal) {
      alert("自由入力ジャンルを入力してください。");
      return;
    }
    wizardData.genre = freeVal;
  }

  await saveWizardDataToIndexedDB(wizardData);

  document.getElementById("wizard-step1").style.display = "none";
  document.getElementById("wizard-step2").style.display = "block";
  updateSelectedGenreDisplay();
}

function buildChipsGenre() {
  let stagePart = (wizStoredStageArr.length > 0) ? "【舞台】" + wizStoredStageArr.join("/") : "";
  let themePart = wizStoredTheme ? "【テーマ】" + wizStoredTheme : "";
  let moodPart = wizStoredMood ? "【雰囲気】" + wizStoredMood : "";
  return stagePart + themePart + moodPart;
}

function onBackToStep1() {
  document.getElementById("wizard-step2").style.display = "none";
  document.getElementById("wizard-step1").style.display = "block";
}

function updateSelectedGenreDisplay() {
  const el = document.getElementById("selected-genre-display");
  if (!el) return;
  el.textContent = wizardData.genre || "(未選択)";
}

function onBackToStep2FromStep3() {
  document.getElementById("wizard-step3").style.display = "none";
  document.getElementById("wizard-step2").style.display = "block";
}

function onSelectScenarioType(type) {
  wizardData.scenarioType = type;
  saveWizardDataToIndexedDB(wizardData);
  // 英語→日本語に変換するラベルを用意
  let typeLabel = "";
  if (type === "objective") {
    typeLabel = "目的達成型";
  } else {
    typeLabel = "探索型";
  }

  const textEl = document.getElementById("confirm-genre-type-text");
  textEl.textContent = `ジャンル: ${wizardData.genre}\nシナリオタイプ: ${typeLabel}`;
  document.getElementById("confirm-scenario-modal").style.display = "flex";
}

function onConfirmScenarioModalCancel() {
  document.getElementById("confirm-scenario-modal").style.display = "none";
}

/** シナリオ生成(ステップ2 OK) */
async function onConfirmScenarioModalOK() {
  showLoadingModal(true);
  document.getElementById("confirm-scenario-modal").style.display = "none";

  try {
    // 1) カレントパーティをwizardDataに格納
    await storePartyInWizardData();

    // 2) シナリオ概要＆クリア条件などをGPTで生成
    if (wizardData.scenarioType === "objective") {
      await generateScenarioSummaryAndClearCondition();
    } else {
      await generateScenarioSummary();
    }

    // 3) セクション
    await generateSections();

    // 4) 導入シーン
    await generateIntroScene();

    // ステップ2->3
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

async function onStartScenario() {
  try {
    let title = wizardData.genre || "新シナリオ";
    const scenarioId = await createNewScenario(wizardData, title);

    if (wizardData.introScene && wizardData.introScene.trim()) {
      const firstScene = {
        scenarioId: scenarioId,
        type: "scene",
        sceneId: "intro_" + Date.now(),
        content: wizardData.introScene
      };
      await addSceneEntry(firstScene);
    }
    window.location.href = `scenario.html?scenarioId=${scenarioId}`;
  } catch (err) {
    console.error("シナリオ開始失敗:", err);
    alert("シナリオ開始失敗: " + err.message);
  }
}

async function generateScenarioSummaryAndClearCondition() {
  try {
    const apiKey = window.apiKey || "";
    if (!apiKey) throw new Error("APIキー未設定");

    wizardData.scenarioSummary = "";
    wizardData.clearCondition = "";

    const prompt = `
      あなたはTRPG用のシナリオ作成に長けたアシスタントです。
      ジャンル:${wizardData.genre}, タイプ:目的達成型。
      1) シナリオ概要(短め)
      2) 【クリア条件】(非公開,プレイヤー非表示)。必ず明示してください。
    `;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "あなたは優秀なTRPGシナリオメーカーです。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.choices[0].message.content || "";
    let sum = text;
    let cc = "";
    if (text.includes("【クリア条件】")) {
      const arr = text.split("【クリア条件】");
      sum = arr[0].trim();
      cc = arr[1] ? arr[1].trim() : "";
    }
    wizardData.scenarioSummary = sum;
    wizardData.clearCondition = cc;
    await saveWizardDataToIndexedDB(wizardData);
  } catch (err) {
    console.error(err);
    alert("目的達成型シナリオ生成失敗: " + err.message);
  }
}

async function generateScenarioSummary() {
  try {
    const apiKey = window.apiKey || "";
    if (!apiKey) throw new Error("APIキー未設定");

    wizardData.scenarioSummary = "";

    const prompt = `
      あなたはTRPGシナリオ作成のプロ。ジャンル:${wizardData.genre}, タイプ:探索型。
      エレメント取得可能。短めの概要を作ってください。
    `;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "あなたは優秀なTRPGシナリオメーカーです。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    wizardData.scenarioSummary = data.choices[0].message.content || "(概要なし)";
    await saveWizardDataToIndexedDB(wizardData);
  } catch (err) {
    console.error(err);
    alert("探索型シナリオ生成失敗: " + err.message);
  }
}

async function generateSections() {
  wizardData.sections = [];
  const count = Math.floor(Math.random() * 4) + 2; // 2..5

  const systemPrompt = `
あなたはTRPGシナリオを小分けにして目標を作るエキスパートです。
絶対に動詞を用いた条件文で書いてください(例:「XXを発見する」「XXを調べる」など)。
セクション数:${count}個、それぞれ1行ずつ動詞で始まるようお願いします。`;
  const userPrompt = `
ジャンル:${wizardData.genre}, シナリオタイプ:${wizardData.scenarioType} 用のセクション達成条件:
必ず動詞～で書いてください。${count}個分、箇条書きで。
`;

  try {
    const apiKey = window.apiKey || "";
    if (!apiKey) throw new Error("APIキー未設定");

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
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
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);

    const text = d.choices[0].message.content || "";
    const lines = text.split("\n").map(l => l.trim()).filter(l => l);

    for (let i = 0; i < count; i++) {
      const raw = lines[i] || (`セクション${i + 1}のダミー(動詞)`);
      wizardData.sections.push({
        number: (i + 1),
        conditionZipped: zipString(raw),
        cleared: false
      });
    }
  } catch (err) {
    console.error("セクション生成失敗:", err);
    // ダミー
    for (let i = 0; i < count; i++) {
      wizardData.sections.push({
        number: (i + 1),
        conditionZipped: zipString(`セクション${i + 1}ダミー(動詞形)`),
        cleared: false
      });
    }
  }
  await saveWizardDataToIndexedDB(wizardData);
}

function zipString(str) {
  const utf8 = new TextEncoder().encode(str);
  const def = pako.deflate(utf8);
  return btoa(String.fromCharCode(...def));
}

async function generateIntroScene() {
  const apiKey = window.apiKey || "";
  if (!apiKey) {
    wizardData.introScene = "(導入生成失敗：APIキー無し)";
    await saveWizardDataToIndexedDB(wizardData);
    return;
  }
  try {
    const pro = `
      あなたはTRPGのゲームマスターです。
      次のシナリオ概要を踏まえ、プレイヤーが行動したくなる導入シーン(300字程度)を作ってください。
      シナリオ概要:
      ${wizardData.scenarioSummary}
    `;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "あなたは優秀なTRPGシナリオライターです。" },
          { role: "user", content: pro }
        ],
        temperature: 0.7
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    wizardData.introScene = data.choices[0].message.content || "(導入空)";
  } catch (err) {
    console.error(err);
    wizardData.introScene = "(導入生成失敗)";
  }
  await saveWizardDataToIndexedDB(wizardData);
}

/** ★カレントパーティ情報を wizardData に格納 */
async function storePartyInWizardData() {
  // currentPartyId
  const cpidStr = localStorage.getItem("currentPartyId") || "";
  if (!cpidStr) {
    // パーティ未設定の場合でもエラーにはしない
    wizardData.party = [];
    wizardData.partyId = 0;
    await saveWizardDataToIndexedDB(wizardData);
    return;
  }
  const pid = parseInt(cpidStr, 10);
  wizardData.partyId = pid;

  const charData = await loadCharacterDataFromIndexedDB();
  if (!charData) {
    wizardData.party = [];
    await saveWizardDataToIndexedDB(wizardData);
    return;
  }
  const partyCards = charData.filter(c => c.group === "Party" && c.partyId === pid);
  const stripped = partyCards.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    rarity: c.rarity,
    state: c.state,
    special: c.special,
    caption: c.caption,
    backgroundcss: c.backgroundcss,
    role: c.role
  }));
  wizardData.party = stripped;
  await saveWizardDataToIndexedDB(wizardData);
}

function updateSummaryUI() {
  const el = document.getElementById("scenario-summary");
  if (!el) return;
  el.textContent = wizardData.scenarioSummary || "(シナリオ概要なし)";
}

function showLoadingModal(show) {
  const m = document.getElementById("loading-modal");
  if (!m) return;
  m.style.display = show ? "flex" : "none";
}

function onCancelFetch() {
  showLoadingModal(false);
}
