/********************************
 * scenarioWizard.js
 * 新しいシナリオ作成ウィザード (複数シナリオ対応)
 ********************************/

let wizardData = {
  genre: "",
  scenarioType: "",      // "objective" or "exploration"
  clearCondition: "",    // 目的達成型ならChatGPTから取得
  scenarioSummary: ""    // 全体のシナリオ要約
};

window.addEventListener("load", async function () {
  await initIndexedDB();
  loadWizardDataFromLocalStorage();

  // イベント設定
  document.getElementById("generate-genre-button").addEventListener("click", onGenerateGenre);
  document.getElementById("clear-genre-button").addEventListener("click", onClearGenre);
  document.getElementById("confirm-genre-button").addEventListener("click", onConfirmGenre);

  document.getElementById("type-objective-btn").addEventListener("click", () => onSelectScenarioType("objective"));
  document.getElementById("type-exploration-btn").addEventListener("click", () => onSelectScenarioType("exploration"));

  document.getElementById("back-to-step1-button").addEventListener("click", onBackToStep1);
  document.getElementById("back-to-step2-button").addEventListener("click", onBackToStep2FromStep3);

  document.getElementById("start-scenario-button").addEventListener("click", onStartScenario);
  document.getElementById("cancel-request-button").addEventListener("click", onCancelFetch);

  // モーダルのOK/Cancel
  document.getElementById("confirm-scenario-ok").addEventListener("click", onConfirmScenarioModalOK);
  document.getElementById("confirm-scenario-cancel").addEventListener("click", onConfirmScenarioModalCancel);

  updateSelectedGenreDisplay();
});

/* ---- ステップ1 ---- */
async function onGenerateGenre() {
  const genreListDiv = document.getElementById("genre-list");
  const apiKey = localStorage.getItem("apiKey") || "";
  if (!apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }

  showLoadingModal(true);
  window.currentRequestController = new AbortController();
  const signal = window.currentRequestController.signal;

  try {
    const messages = [
      { role: "system", content: "あなたはTRPGのプロです。ジャンルを5つ提案してください。" },
      { role: "user", content: "SF, 中世ファンタジー, 現代など、TRPGに使いやすいジャンル候補を5つ、箇条書きで出してください。" }
    ];
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: messages,
        temperature: 0.7
      }),
      signal
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const content = data.choices[0].message.content;
    const lines = content.split("\n").map(l => l.trim()).filter(l => l);

    // appendでボタンを追加
    lines.forEach(line => {
      const btn = document.createElement("button");
      btn.classList.add("candidate-button");
      btn.textContent = line.replace(/^\d+\.\s*/, "");
      btn.style.display = "block";
      btn.style.margin = "5px 0";

      btn.addEventListener("click", () => {
        wizardData.genre = btn.textContent;
        saveWizardDataToLocalStorage();
        highlightSelectedButton(genreListDiv, btn);
        // ステップ1→ステップ2
        document.getElementById("wizard-step1").style.display = "none";
        document.getElementById("wizard-step2").style.display = "block";
        updateSelectedGenreDisplay();
      });
      genreListDiv.appendChild(btn);
    });
  } catch (err) {
    if (err.name === "AbortError") {
      console.log("ジャンル生成キャンセル");
    } else {
      console.error(err);
      alert("ジャンル生成に失敗しました:\n" + err.message);
    }
  } finally {
    showLoadingModal(false);
  }
}

function onClearGenre() {
  const genreListDiv = document.getElementById("genre-list");
  genreListDiv.innerHTML = "";
  wizardData.genre = "";
  document.getElementById("free-genre-input").value = "";
  saveWizardDataToLocalStorage();
}

function onConfirmGenre() {
  const freeInput = document.getElementById("free-genre-input");
  const txt = (freeInput.value || "").trim();
  if (!txt) {
    alert("ジャンルを入力してください。");
    return;
  }
  wizardData.genre = txt;
  saveWizardDataToLocalStorage();

  // ステップ1→ステップ2
  document.getElementById("wizard-step1").style.display = "none";
  document.getElementById("wizard-step2").style.display = "block";
  updateSelectedGenreDisplay();
}

/* ---- ステップ2 ---- */

// シナリオタイプ選択時→いきなり生成せず、モーダルを出す
function onSelectScenarioType(type) {
  wizardData.scenarioType = type;
  saveWizardDataToLocalStorage();

  // モーダルのテキストを更新
  const textEl = document.getElementById("confirm-genre-type-text");
  textEl.textContent = `ジャンル: ${wizardData.genre}\nシナリオタイプ: ${type === "objective" ? "目的達成型" : "探索型"}`;
  // モーダル表示
  const modal = document.getElementById("confirm-scenario-modal");
  modal.style.display = "flex";
}

// モーダル: OK
async function onConfirmScenarioModalOK() {
  // モーダルを閉じる
  const modal = document.getElementById("confirm-scenario-modal");
  modal.style.display = "none";

  // ここでシナリオ生成開始
  if (wizardData.scenarioType === "objective") {
    await generateScenarioSummaryAndClearCondition();
  } else {
    await generateScenarioSummary();
  }

  // ステップ2→ステップ3
  document.getElementById("wizard-step2").style.display = "none";
  document.getElementById("wizard-step3").style.display = "block";
}

// モーダル: キャンセル
function onConfirmScenarioModalCancel() {
  const modal = document.getElementById("confirm-scenario-modal");
  modal.style.display = "none";
  // ステップ2に留まる
}

function onBackToStep1() {
  document.getElementById("wizard-step2").style.display = "none";
  document.getElementById("wizard-step1").style.display = "block";
}

/* ---- ステップ3 ---- */

// 「ステップ2に戻る」
function onBackToStep2FromStep3() {
  document.getElementById("wizard-step3").style.display = "none";
  document.getElementById("wizard-step2").style.display = "block";
}

// 「このシナリオで始める」 => 新しいシナリオIDを発行し、scenario.html へ
async function onStartScenario() {
  try {
    // シナリオ名を何にするか？ ひとまずジャンルか、あるいは "新シナリオ"
    let title = wizardData.genre || "新シナリオ";

    // シナリオをDBに追加
    const scenarioId = await createNewScenario(wizardData, title);

    // scenario.html?scenarioId=xxx に飛ぶ
    window.location.href = `scenario.html?scenarioId=${scenarioId}`;
  } catch (err) {
    console.error("シナリオ作成失敗:", err);
    alert("シナリオを開始できませんでした:\n" + err.message);
  }
}

/* ---- シナリオ生成 (GPT呼び出し) ---- */
async function generateScenarioSummaryAndClearCondition() {
  wizardData.scenarioSummary = "";
  wizardData.clearCondition = "";
  saveWizardDataToLocalStorage();

  const apiKey = localStorage.getItem("apiKey") || "";
  if (!apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }

  showLoadingModal(true);
  window.currentRequestController = new AbortController();
  const signal = window.currentRequestController.signal;

  try {
    const prompt = `
      あなたはTRPG用のシナリオ作成に長けたアシスタントです。
      ジャンルは「${wizardData.genre}」、シナリオタイプは「目的達成型」です。
      以下を生成してください：
      1. シナリオの概要（短め）
      2. このシナリオのクリア条件（【クリア条件】という見出しで書いてください）
         ただし、【クリア条件】はプレイヤーに公開しません。
    `;
    const messages = [
      { role: "system", content: "あなたは優秀なTRPGシナリオメーカーです。" },
      { role: "user", content: prompt }
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages,
        temperature: 0.7
      }),
      signal
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.choices[0].message.content;
    let clearConditionPart = "";
    let summaryPart = text;
    if (text.includes("【クリア条件】")) {
      const arr = text.split("【クリア条件】");
      summaryPart = arr[0].trim();
      clearConditionPart = arr[1] ? arr[1].trim() : "";
    }
    wizardData.scenarioSummary = summaryPart;
    wizardData.clearCondition = clearConditionPart;
  } catch (err) {
    if (err.name === "AbortError") {
      console.log("目的達成型シナリオ生成キャンセル");
    } else {
      console.error(err);
      alert("目的達成型シナリオ生成に失敗:\n" + err.message);
    }
  } finally {
    showLoadingModal(false);
    saveWizardDataToLocalStorage();
    updateSummaryUI();
  }
}

async function generateScenarioSummary() {
  wizardData.scenarioSummary = "";
  saveWizardDataToLocalStorage();

  const apiKey = localStorage.getItem("apiKey") || "";
  if (!apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }

  showLoadingModal(true);
  window.currentRequestController = new AbortController();
  const signal = window.currentRequestController.signal;

  try {
    const prompt = `
      あなたはTRPG用のシナリオ作成に長けたアシスタントです。
      ジャンルは「${wizardData.genre}」、シナリオタイプは「探索型」です。
      ストーリー内でエレメントを手に入れることができるようにしてください。
      概要は短めで、プレイヤーが興味を持ちそうな設定を盛り込んでください。
    `;
    const messages = [
      { role: "system", content: "あなたは優秀なTRPGシナリオメーカーです。" },
      { role: "user", content: prompt }
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages,
        temperature: 0.7
      }),
      signal
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    wizardData.scenarioSummary = data.choices[0].message.content;
  } catch (err) {
    if (err.name === "AbortError") {
      console.log("探索型シナリオ生成キャンセル");
    } else {
      console.error(err);
      alert("探索型シナリオ生成に失敗:\n" + err.message);
    }
  } finally {
    showLoadingModal(false);
    saveWizardDataToLocalStorage();
    updateSummaryUI();
  }
}

/* ---- 表示更新 ---- */
function updateSummaryUI() {
  const summaryDiv = document.getElementById("scenario-summary");
  const scenario = wizardData.scenarioSummary || "（シナリオ概要なし）";
  summaryDiv.textContent = scenario;
}

function updateSelectedGenreDisplay() {
  const displayEl = document.getElementById("selected-genre-display");
  if (!displayEl) return;
  if (wizardData.genre) {
    displayEl.textContent = wizardData.genre;
  } else {
    displayEl.textContent = "（未選択）";
  }
}

/* ---- localStorage ---- */
function loadWizardDataFromLocalStorage() {
  const dataStr = localStorage.getItem("wizardData");
  if (!dataStr) return;
  try {
    const obj = JSON.parse(dataStr);
    wizardData = obj;
  } catch (e) {
    console.warn("wizardData parse失敗", e);
  }
}

function saveWizardDataToLocalStorage() {
  localStorage.setItem("wizardData", JSON.stringify(wizardData));
}

/* ---- モーダル操作 ---- */
function showLoadingModal(show) {
  const modal = document.getElementById("loading-modal");
  if (!modal) return;
  modal.style.display = show ? "flex" : "none";
}

function onCancelFetch() {
  if (window.currentRequestController) {
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}

/** ハイライト */
function highlightSelectedButton(container, targetBtn) {
  const allBtns = container.querySelectorAll(".candidate-button");
  allBtns.forEach(b => b.style.backgroundColor = "");
  targetBtn.style.backgroundColor = "#8BC34A";
}
