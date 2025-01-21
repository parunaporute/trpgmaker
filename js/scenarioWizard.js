let wizardData = {
  genre: "",           // 「【舞台】...【テーマ】...【雰囲気】...」 or 自由入力
  scenarioType: "",    // "objective" or "exploration"
  clearCondition: "",
  scenarioSummary: "",
  introScene: "",
  party: [],
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

/** ★追加：APIキーを読み込む */
window.apiKey = localStorage.getItem("apiKey") || "";

window.addEventListener("load", async function () {
  // IndexedDB初期化
  await initIndexedDB();

  // 既存wizardDataあればロード
  const storedWizard = await loadWizardDataFromIndexedDB();
  if (storedWizard) {
    wizardData = storedWizard;
  }

  // 舞台/テーマ/雰囲気 の初期化
  initWizardChips();

  // イベント
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

  // 「その他」モーダルボタン
  document.getElementById("wizard-other-generate-btn").addEventListener("click", wizardOtherGenerate);
  document.getElementById("wizard-other-ok-btn").addEventListener("click", wizardOtherOk);
  document.getElementById("wizard-other-cancel-btn").addEventListener("click", wizardOtherCancel);

  // 「削除」確認モーダルボタン
  document.getElementById("wizard-delete-confirm-ok").addEventListener("click", wizardDeleteConfirmOk);
  document.getElementById("wizard-delete-confirm-cancel").addEventListener("click", wizardDeleteConfirmCancel);

  updateSelectedGenreDisplay();
  updateSummaryUI();
});

/* =============================================
   舞台/テーマ/雰囲気 のチップ初期描画
============================================= */
function initWizardChips() {
  // 1) 共有の localStorage から取得
  // 舞台
  const sjson = localStorage.getItem("elementStageArr");
  if (sjson) {
    try {
      wizStoredStageArr = JSON.parse(sjson);
    } catch(e) {
      wizStoredStageArr = [];
    }
  } else {
    wizStoredStageArr = [];
  }
  // テーマ
  wizStoredTheme = localStorage.getItem("elementTheme") || "";
  // 雰囲気
  wizStoredMood  = localStorage.getItem("elementMood")  || "";

  // 2) カスタム
  wizCustomStageChips = loadWizardCustom("customStageChips");
  wizCustomThemeChips = loadWizardCustom("customThemeChips");
  wizCustomMoodChips  = loadWizardCustom("customMoodChips");

  // 3) DOM生成
  renderWizardStageChips();
  renderWizardThemeChips();
  renderWizardMoodChips();

  // 現在の選択テキスト
  updateWizGenreResultText();
}

function loadWizardCustom(key) {
  try {
    const j = localStorage.getItem(key);
    if (!j) return [];
    return JSON.parse(j);
  } catch(e) {
    return [];
  }
}

/* 舞台(複数) */
function renderWizardStageChips() {
  const defaultList = ["ファンタジー","SF","歴史・時代劇","現代","ホラー / ダーク"];
  const container = document.getElementById("wiz-stage-chips-container");
  if (!container) return;
  container.innerHTML = "";

  const all = [...defaultList, ...wizCustomStageChips, "その他"];
  all.forEach(label => {
    const chip = createWizardChip(label, "stage");
    container.appendChild(chip);
  });
}

/* テーマ(単一) */
function renderWizardThemeChips() {
  const defaultList = ["アクション / 冒険","ミステリー / サスペンス","ロマンス / ドラマ","コメディ / ほのぼの","ホラー / スリラー"];
  const container = document.getElementById("wiz-theme-chips-container");
  if (!container) return;
  container.innerHTML = "";

  const all = [...defaultList, ...wizCustomThemeChips, "その他"];
  all.forEach(label => {
    const chip = createWizardChip(label, "theme");
    container.appendChild(chip);
  });
}

/* 雰囲気(単一) */
function renderWizardMoodChips() {
  const defaultList = ["ライト / ポップ","中間 / バランス型","ダーク / シリアス"];
  const container = document.getElementById("wiz-mood-chips-container");
  if (!container) return;
  container.innerHTML = "";

  const all = [...defaultList, ...wizCustomMoodChips, "その他"];
  all.forEach(label => {
    const chip = createWizardChip(label, "mood");
    container.appendChild(chip);
  });
}

/* =============================================
   チップ要素作成 (トグル選択)
============================================= */
function createWizardChip(label, category) {
  const isOther = (label==="その他");
  const chip = document.createElement("div");
  chip.className = "chip";
  chip.textContent = label;

  // 選択状態
  if (category==="stage") {
    if (wizStoredStageArr.includes(label)) {
      chip.classList.add("selected");
    }
  } else if (category==="theme") {
    if (wizStoredTheme===label) {
      chip.classList.add("selected");
    }
  } else if (category==="mood") {
    if (wizStoredMood===label) {
      chip.classList.add("selected");
    }
  }

  // クリック
  chip.addEventListener("click", () => {
    if (isOther) {
      // その他モーダル
      openWizardOtherModal(category);
      return;
    }

    if (category==="stage") {
      // 複数トグル
      if (chip.classList.contains("selected")) {
        chip.classList.remove("selected");
        wizStoredStageArr = wizStoredStageArr.filter(x=> x!==label);
      } else {
        chip.classList.add("selected");
        wizStoredStageArr.push(label);
      }
      localStorage.setItem("elementStageArr", JSON.stringify(wizStoredStageArr));
    } else if (category==="theme") {
      // 単一トグル
      if (chip.classList.contains("selected")) {
        // 再クリックで未選択
        chip.classList.remove("selected");
        wizStoredTheme = "";
        localStorage.setItem("elementTheme", "");
      } else {
        // 全オフ->クリックをON
        const cont = document.getElementById("wiz-theme-chips-container");
        const allChips = cont.querySelectorAll(".chip");
        allChips.forEach(c=> c.classList.remove("selected"));
        chip.classList.add("selected");
        wizStoredTheme = label;
        localStorage.setItem("elementTheme", wizStoredTheme);
      }
    } else if (category==="mood") {
      // 単一トグル
      if (chip.classList.contains("selected")) {
        chip.classList.remove("selected");
        wizStoredMood = "";
        localStorage.setItem("elementMood", "");
      } else {
        const cont = document.getElementById("wiz-mood-chips-container");
        const allChips = cont.querySelectorAll(".chip");
        allChips.forEach(c=> c.classList.remove("selected"));
        chip.classList.add("selected");
        wizStoredMood = label;
        localStorage.setItem("elementMood", wizStoredMood);
      }
    }
    updateWizGenreResultText();
  });

  // カスタム削除ボタン
  if (!isOther) {
    if (category==="stage" && wizCustomStageChips.includes(label)) {
      addWizardRemoveButton(chip, label, "stage");
    } else if (category==="theme" && wizCustomThemeChips.includes(label)) {
      addWizardRemoveButton(chip, label, "theme");
    } else if (category==="mood" && wizCustomMoodChips.includes(label)) {
      addWizardRemoveButton(chip, label, "mood");
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
  span.addEventListener("click", (e)=>{
    e.stopPropagation();
    wizardDeletingChipLabel = label;
    wizardDeletingChipCategory = category;
    document.getElementById("wizard-delete-confirm-modal").style.display="flex";
  });
  chip.appendChild(span);
}

/* =============================================
   その他モーダル
============================================= */
function openWizardOtherModal(category) {
  wizardCurrentOtherCategory = category;
  const catText =
    (category==="stage") ? "舞台に追加する「その他」" :
    (category==="theme") ? "テーマに追加する「その他」" :
    "雰囲気に追加する「その他」";

  document.getElementById("wizard-other-input-modal-category").textContent = catText;
  document.getElementById("wizard-other-input-text").value = "";
  document.getElementById("wizard-other-input-modal").style.display="flex";
}

async function wizardOtherGenerate() {
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }

  let existingList = [];
  if (wizardCurrentOtherCategory==="stage") {
    existingList = ["ファンタジー","SF","歴史・時代劇","現代","ホラー / ダーク", ...wizCustomStageChips];
  } else if (wizardCurrentOtherCategory==="theme") {
    existingList = ["アクション / 冒険","ミステリー / サスペンス","ロマンス / ドラマ","コメディ / ほのぼの","ホラー / スリラー", ...wizCustomThemeChips];
  } else if (wizardCurrentOtherCategory==="mood") {
    existingList = ["ライト / ポップ","中間 / バランス型","ダーク / シリアス", ...wizCustomMoodChips];
  }

  showLoadingModal(true);
  try {
    const systemPrompt = "あなたは創造力豊かなアシスタントです。回答は1つだけ。";
    const userPrompt = `既存候補:${existingList.join(" / ")}\nこれらに無い新しい案を1つ提案してください。`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${window.apiKey}`
      },
      body:JSON.stringify({
        model:"gpt-4",
        messages:[
          {role:"system", content:systemPrompt},
          {role:"user", content:userPrompt}
        ],
        temperature:0.7
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const newCandidate = (data.choices[0].message.content||"").trim();
    document.getElementById("wizard-other-input-text").value = newCandidate;
  } catch(err) {
    console.error(err);
    alert("その他生成失敗:\n" + err.message);
  } finally {
    showLoadingModal(false);
  }
}

function wizardOtherOk() {
  const val = document.getElementById("wizard-other-input-text").value.trim();
  if (!val) {
    document.getElementById("wizard-other-input-modal").style.display="none";
    return;
  }

  if (wizardCurrentOtherCategory==="stage") {
    if (!wizCustomStageChips.includes(val)) {
      wizCustomStageChips.push(val);
      localStorage.setItem("customStageChips", JSON.stringify(wizCustomStageChips));
    }
    renderWizardStageChips();
  } else if (wizardCurrentOtherCategory==="theme") {
    if (!wizCustomThemeChips.includes(val)) {
      wizCustomThemeChips.push(val);
      localStorage.setItem("customThemeChips", JSON.stringify(wizCustomThemeChips));
    }
    renderWizardThemeChips();
  } else if (wizardCurrentOtherCategory==="mood") {
    if (!wizCustomMoodChips.includes(val)) {
      wizCustomMoodChips.push(val);
      localStorage.setItem("customMoodChips", JSON.stringify(wizCustomMoodChips));
    }
    renderWizardMoodChips();
  }

  document.getElementById("wizard-other-input-modal").style.display="none";
  updateWizGenreResultText();
}

function wizardOtherCancel() {
  document.getElementById("wizard-other-input-modal").style.display="none";
}

/* =============================================
   削除モーダル
============================================= */
function wizardDeleteConfirmOk() {
  if (wizardDeletingChipCategory==="stage") {
    wizCustomStageChips = wizCustomStageChips.filter(c=> c!==wizardDeletingChipLabel);
    localStorage.setItem("customStageChips", JSON.stringify(wizCustomStageChips));
    // 選択中なら外す
    wizStoredStageArr = wizStoredStageArr.filter(x=> x!==wizardDeletingChipLabel);
    localStorage.setItem("elementStageArr", JSON.stringify(wizStoredStageArr));
    renderWizardStageChips();
  } else if (wizardDeletingChipCategory==="theme") {
    wizCustomThemeChips = wizCustomThemeChips.filter(c=> c!==wizardDeletingChipLabel);
    localStorage.setItem("customThemeChips", JSON.stringify(wizCustomThemeChips));
    if (wizStoredTheme===wizardDeletingChipLabel) {
      wizStoredTheme="";
      localStorage.setItem("elementTheme", "");
    }
    renderWizardThemeChips();
  } else if (wizardDeletingChipCategory==="mood") {
    wizCustomMoodChips = wizCustomMoodChips.filter(c=> c!==wizardDeletingChipLabel);
    localStorage.setItem("customMoodChips", JSON.stringify(wizCustomMoodChips));
    if (wizStoredMood===wizardDeletingChipLabel) {
      wizStoredMood="";
      localStorage.setItem("elementMood", "");
    }
    renderWizardMoodChips();
  }

  wizardDeletingChipLabel="";
  wizardDeletingChipCategory="";
  document.getElementById("wizard-delete-confirm-modal").style.display="none";
  updateWizGenreResultText();
}

function wizardDeleteConfirmCancel() {
  wizardDeletingChipLabel="";
  wizardDeletingChipCategory="";
  document.getElementById("wizard-delete-confirm-modal").style.display="none";
}

/* =============================================
   現在のチップ選択状況を文章化
============================================= */
function updateWizGenreResultText() {
  let stagePart = (wizStoredStageArr.length>0) ? "【舞台】"+wizStoredStageArr.join("/") : "";
  let themePart = wizStoredTheme ? "【テーマ】"+wizStoredTheme : "";
  let moodPart  = wizStoredMood  ? "【雰囲気】"+wizStoredMood : "";

  let result = stagePart + themePart + moodPart;
  document.getElementById("wiz-genre-result-text").textContent = result;
}

/* =============================================
   STEP1 -> STEP2 (自由入力 or チップ)
============================================= */
async function onGoStep2() {
  // まずテキスト入力欄を優先
  const freeVal = document.getElementById("free-genre-input").value.trim();
  if (freeVal) {
    wizardData.genre = freeVal;
  } else {
    // チップを合成
    wizardData.genre = buildChipsGenre();
  }

  if (!wizardData.genre) {
    alert("ジャンルを入力または選択してください。");
    return;
  }

  await saveWizardDataToIndexedDB(wizardData);

  // 次のステップへ
  document.getElementById("wizard-step1").style.display = "none";
  document.getElementById("wizard-step2").style.display = "block";
  updateSelectedGenreDisplay();
}

function buildChipsGenre() {
  let stagePart = (wizStoredStageArr.length>0) ? "【舞台】"+wizStoredStageArr.join("/") : "";
  let themePart = wizStoredTheme ? "【テーマ】"+wizStoredTheme : "";
  let moodPart = wizStoredMood ? "【雰囲気】"+wizStoredMood : "";
  return stagePart + themePart + moodPart;
}

/* STEP2 <- 戻る */
function onBackToStep1() {
  document.getElementById("wizard-step2").style.display = "none";
  document.getElementById("wizard-step1").style.display = "block";
}

function updateSelectedGenreDisplay() {
  const el = document.getElementById("selected-genre-display");
  if (!el) return;
  el.textContent = wizardData.genre || "(未選択)";
}

/* STEP3 <- 戻る */
function onBackToStep2FromStep3() {
  document.getElementById("wizard-step3").style.display = "none";
  document.getElementById("wizard-step2").style.display = "block";
}

/* =============================================
   シナリオタイプ選択
============================================= */
function onSelectScenarioType(type) {
  wizardData.scenarioType = type;
  saveWizardDataToIndexedDB(wizardData);

  const textEl = document.getElementById("confirm-genre-type-text");
  textEl.textContent = `ジャンル: ${wizardData.genre}\nシナリオタイプ: ${type}`;
  document.getElementById("confirm-scenario-modal").style.display="flex";
}

function onConfirmScenarioModalCancel() {
  document.getElementById("confirm-scenario-modal").style.display="none";
}

async function onConfirmScenarioModalOK() {
  document.getElementById("confirm-scenario-modal").style.display="none";

  await storePartyInWizardData();  // パーティ情報(空でもOK)

  if (wizardData.scenarioType==="objective") {
    await generateScenarioSummaryAndClearCondition();
  } else {
    await generateScenarioSummary();
  }
  await generateSections();
  await generateIntroScene();

  // STEP2->STEP3
  document.getElementById("wizard-step2").style.display="none";
  document.getElementById("wizard-step3").style.display="block";
  updateSummaryUI();
}

/* =============================================
   シナリオ開始
============================================= */
async function onStartScenario() {
  try {
    let title = wizardData.genre || "新シナリオ";
    const scenarioId = await createNewScenario(wizardData, title);

    if (wizardData.introScene && wizardData.introScene.trim()) {
      const firstScene = {
        scenarioId,
        type:"scene",
        sceneId:"intro_"+Date.now(),
        content:wizardData.introScene
      };
      await addSceneEntry(firstScene);
    }
    window.location.href = `scenario.html?scenarioId=${scenarioId}`;
  } catch(err) {
    console.error("シナリオ作成失敗:", err);
    alert("シナリオ開始失敗: "+err.message);
  }
}

/* =============================================
   シナリオ要約(目的達成型)
============================================= */
async function generateScenarioSummaryAndClearCondition(){
  showLoadingModal(true);
  try {
    const apiKey = window.apiKey || "";
    if(!apiKey) throw new Error("APIキー未設定");

    wizardData.scenarioSummary = "";
    wizardData.clearCondition = "";

    const prompt = `
      あなたはTRPG用のシナリオ作成に長けたアシスタントです。
      ジャンル:${wizardData.genre}, タイプ:目的達成型。
      1) シナリオ概要(短め)
      2) 【クリア条件】(非公開,プレイヤー非表示)。必ず明示してください。
    `;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        model:"gpt-4",
        messages:[
          { role:"system", content:"あなたは優秀なTRPGシナリオメーカーです。" },
          { role:"user", content: prompt }
        ],
        temperature:0.7
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.choices[0].message.content||"";
    let sum = text;
    let cc = "";
    if (text.includes("【クリア条件】")) {
      const arr = text.split("【クリア条件】");
      sum = arr[0].trim();
      cc = arr[1]? arr[1].trim():"";
    }
    wizardData.scenarioSummary = sum;
    wizardData.clearCondition = cc;
    await saveWizardDataToIndexedDB(wizardData);
  } catch(err){
    console.error(err);
    alert("目的達成型シナリオ生成失敗: "+err.message);
  } finally {
    showLoadingModal(false);
  }
}

/* =============================================
   シナリオ要約(探索型)
============================================= */
async function generateScenarioSummary() {
  showLoadingModal(true);
  try {
    const apiKey = window.apiKey || "";
    if(!apiKey) throw new Error("APIキー未設定");

    wizardData.scenarioSummary = "";

    const prompt = `
      あなたはTRPGシナリオ作成のプロ。ジャンル:${wizardData.genre}, タイプ:探索型。
      エレメント取得可能。短めの概要を作ってください。
    `;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        model:"gpt-4",
        messages:[
          { role:"system", content:"あなたは優秀なTRPGシナリオメーカーです。" },
          { role:"user", content: prompt }
        ],
        temperature:0.7
      })
    });
    const data = await resp.json();
    if(data.error) throw new Error(data.error.message);

    wizardData.scenarioSummary = data.choices[0].message.content||"(概要なし)";
    await saveWizardDataToIndexedDB(wizardData);
  } catch(err){
    console.error(err);
    alert("探索型シナリオ生成失敗: "+err.message);
  } finally {
    showLoadingModal(false);
  }
}

/* =============================================
   セクション(達成条件)を生成
============================================= */
async function generateSections() {
  wizardData.sections = [];
  const count = Math.floor(Math.random()*4)+2; //2..5

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
    if(!apiKey) throw new Error("APIキー未設定");

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        model:"gpt-4",
        messages:[
          { role:"system", content: systemPrompt },
          { role:"user", content: userPrompt }
        ],
        temperature:0.7
      })
    });
    const d = await r.json();
    if(d.error) throw new Error(d.error.message);

    const text = d.choices[0].message.content||"";
    const lines = text.split("\n").map(l=>l.trim()).filter(l=>l);

    for(let i=0;i<count;i++){
      const raw = lines[i]||(`セクション${i+1}のダミー(動詞)`);
      wizardData.sections.push({
        number:(i+1),
        conditionZipped: zipString(raw),
        cleared:false
      });
    }
  } catch(err) {
    console.error("セクション生成失敗:", err);
    // ダミー
    for(let i=0;i<count;i++){
      wizardData.sections.push({
        number:(i+1),
        conditionZipped: zipString(`セクション${i+1}ダミー(動詞形)`),
        cleared:false
      });
    }
  }
  await saveWizardDataToIndexedDB(wizardData);
}

function zipString(str){
  const utf8 = new TextEncoder().encode(str);
  const def = pako.deflate(utf8);
  return btoa(String.fromCharCode(...def));
}

/* =============================================
   冒頭シーン
============================================= */
async function generateIntroScene(){
  const apiKey = window.apiKey || "";
  if(!apiKey){
    wizardData.introScene = "(導入生成失敗：APIキー無し)";
    await saveWizardDataToIndexedDB(wizardData);
    return;
  }
  try{
    const pro = `
      あなたはTRPGのゲームマスターです。
      次のシナリオ概要を踏まえ、プレイヤーが行動したくなる導入シーン(300字程度)を作ってください。
      シナリオ概要:
      ${wizardData.scenarioSummary}
    `;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        model:"gpt-4",
        messages:[
          { role:"system", content:"あなたは優秀なTRPGシナリオライターです。" },
          { role:"user", content: pro }
        ],
        temperature:0.7
      })
    });
    const data = await resp.json();
    if(data.error) throw new Error(data.error.message);

    wizardData.introScene = data.choices[0].message.content||"(導入空)";
  } catch(err){
    console.error(err);
    wizardData.introScene="(導入生成失敗)";
  }
  await saveWizardDataToIndexedDB(wizardData);
}

/* =============================================
   パーティ情報を wizardData に格納
============================================= */
async function storePartyInWizardData(){
  const charData = await loadCharacterDataFromIndexedDB();
  if(!charData)return;

  const party = charData.filter(c=> c.group==="Party");
  const stripped = party.map(c=>({
    id:c.id, name:c.name, type:c.type,
    rarity:c.rarity, state:c.state, special:c.special,
    caption:c.caption, backgroundcss:c.backgroundcss
  }));
  wizardData.party = stripped;
  await saveWizardDataToIndexedDB(wizardData);
}

/* =============================================
   ステップ3表示更新
============================================= */
function updateSummaryUI(){
  const el = document.getElementById("scenario-summary");
  if(!el)return;
  el.textContent = wizardData.scenarioSummary || "(シナリオ概要なし)";
}

/* =============================================
   ローディングモーダル
============================================= */
function showLoadingModal(show){
  const m = document.getElementById("loading-modal");
  if(!m)return;
  m.style.display = show?"flex":"none";
}
function onCancelFetch(){
  showLoadingModal(false);
}
