// tutorialManager.js
(function() {
  if (!window.tutorials || !Array.isArray(window.tutorials)) {
    console.warn("No tutorials found.");
    return;
  }

  // -------------------------------------------
  // A) グローバル(本ファイル内)で使う変数
  // -------------------------------------------
  let tutorialOverlay = null;    // 薄暗い背景
  let tutorialDialog = null;     // メッセージを表示する枠
  let modalCheckInterval = null; // モーダル監視用
  let highlightEl = null;        // ハイライト中の要素
  let handleClick = null;        // waitForClickOnで使うイベントリスナ
  let onCloseCallback = null;    // ダイアログ閉じ時のコールバック

  // 現在表示中の subStep データ
  let currentSubStep = null; 

  // -------------------------------------------
  // B) 初期化
  // -------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    initTutorialElements();   // オーバーレイ & ダイアログ生成
    initTutorial();           // チュートリアル開始処理
  });

  function initTutorialElements() {
    // 既に存在すれば使い回し
    if (document.getElementById("tutorial-overlay")) {
      tutorialOverlay = document.getElementById("tutorial-overlay");
      tutorialDialog = document.getElementById("tutorial-dialog");
      return;
    }

    // --- (1) オーバーレイ ---
    tutorialOverlay = document.createElement("div");
    tutorialOverlay.id = "tutorial-overlay";
    Object.assign(tutorialOverlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0,0,0,0.4)",
      zIndex: "19998",
      display: "none",
      pointerEvents: "auto"
    });
    document.body.appendChild(tutorialOverlay);

    // --- (2) ダイアログ ---
    tutorialDialog = document.createElement("div");
    tutorialDialog.id = "tutorial-dialog";
    Object.assign(tutorialDialog.style, {
      position: "fixed",
      zIndex: "19999",
      pointerEvents: "auto",
      width: "300px",
      padding: "15px",
      backgroundColor: "rgba(255,242,207,0.88)",
      boxSizing: "border-box",
      display: "none",
      opacity: "0",
      transition: "opacity 0.25s"
    });
    document.body.appendChild(tutorialDialog);
  }

  // -------------------------------------------
  // C) チュートリアル全体管理
  // -------------------------------------------
  function initTutorial() {
    const forcedTutorialId = getQueryParam("forceTutorial");
    if (forcedTutorialId) {
      // URLパラメータ指定があれば強制実行
      const targetTutorial = window.tutorials.find(t => t.id === forcedTutorialId);
      if (targetTutorial) {
        runTutorialImmediately(targetTutorial);
      }
      return;
    }

    // 通常実行: 現在ページにマッチするstepを持つ取説を探して、未完了なら実行
    const currentPage = getCurrentPageName();
    const pageTutorials = window.tutorials.filter(story =>
      story.steps.some(step => step.type === "page" && step.match === currentPage)
    );

    // ID末尾の数字が小さい順にソート ("story1" -> 1, etc.)
    pageTutorials.sort((a, b) => getStoryIdNumber(a.id) - getStoryIdNumber(b.id));

    for (const story of pageTutorials) {
      const isCompleted = localStorage.getItem("completeStory_" + story.id) === "true";
      if (!isCompleted) {
        startTutorialSteps(story);
        break; // 1つ実行したら終了
      }
    }
  }

  function runTutorialImmediately(story) {
    const currentPage = getCurrentPageName();
    const hasCurrentPageStep = story.steps.some(
      step => step.type === "page" && step.match === currentPage
    );
    if (hasCurrentPageStep) {
      startTutorialSteps(story);
    }
  }

  // -------------------------------------------
  // D) 取説ステップ開始
  // -------------------------------------------
  function startTutorialSteps(story) {
    // 「type=page & match=現在ページ」のstepを探す
    const step = story.steps.find(s => s.type === "page" && s.match === getCurrentPageName());
    if (!step) return;

    // subSteps が無ければ単発表示
    if (!step.subSteps || step.subSteps.length === 0) {
      showTutorialDialog(story.title, step.message, null, (action) => {
        // 「次は表示しない」にチェックが入っていれば完了扱い
        if (action.skipCheck) {
          localStorage.setItem("completeStory_" + story.id, "true");
        } else if (action.ok) {
          // OK(次へ)なら完了扱い
          localStorage.setItem("completeStory_" + story.id, "true");
        }
      });
      return;
    }

    // subSteps がある場合、順に実行
    let currentSub = 0;
    console.log("subSteps",step.subSteps);

    function showNextSub() {
      //console.log("サブステップに入った",currentSub + ":" + step.subSteps.length);
      if (currentSub >= step.subSteps.length) {
        // 全て表示し終わったら完了
        localStorage.setItem("completeStory_" + story.id, "true");
        return;
      }
      const sub = step.subSteps[currentSub];
      showTutorialDialog(story.title, sub.message, sub, (action) => {
        console.log("showNextSub",sub);

        console.log("action.skipCheck",action.skipCheck);
        if (action.skipCheck) {
          // 「次は表示しない」→ 残りのsubStepsはスキップして完了
          localStorage.setItem("completeStory_" + story.id, "true");
          console.log("チェックされてる");
          return;
        }
        if (action.ok) {
          console.log("次へ が押下されました");
          // 次へ
          currentSub++;
          showNextSub();
        }
      });
    }
    showNextSub();
  }

  // -------------------------------------------
  // E) ダイアログの表示 / 非表示
  // -------------------------------------------
  function showTutorialDialog(title, message, subStep, onClose) {
    //console.log("onClose",onClose);
    // コールバック保持
    onCloseCallback = onClose || null;
    currentSubStep = subStep || null;

    // ダイアログHTML
    tutorialDialog.innerHTML = buildDialogHTML(title, message);

    // オーバーレイ & ダイアログを表示
    tutorialOverlay.style.display = "block";
    tutorialDialog.style.display = "block";
    tutorialDialog.style.opacity = "0"; // フェードイン前の初期状態

    // ボタン取得
    const nextBtn = tutorialDialog.querySelector("#tutorial-next-btn");
    const cancelBtn = tutorialDialog.querySelector("#tutorial-cancel-btn");
    const skipCheck = tutorialDialog.querySelector("#tutorial-skip-checkbox");
    //console.log("nextBtn");

    // イベント設定
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        hideTutorialDialog({
          ok: true,
          cancel: false,
          skipCheck: skipCheck && skipCheck.checked
        });
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        hideTutorialDialog({
          ok: false,
          cancel: true,
          skipCheck: skipCheck && skipCheck.checked
        });
      });
    }

    // ★「OK」ボタンを表示しないフラグ (removeOkButton)
    if (subStep && subStep.removeOkButton && nextBtn) {
      nextBtn.style.display = "none";
    }

    // ハイライト対象
    highlightEl = null;
    if (subStep && subStep.highlightSelector) {
      highlightEl = document.querySelector(subStep.highlightSelector);
      if (highlightEl) {
        highlightEl.classList.add("tutorial-highlight");
        highlightEl.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        waitForScrollEnd(highlightEl, () => {
          positionDialogAvoidOverlap(tutorialDialog, highlightEl);
          requestAnimationFrame(() => {
            tutorialDialog.style.opacity = "1"; // フェードイン
          });
        });
      } else {
        centerDialog(tutorialDialog);
        requestAnimationFrame(() => {
          tutorialDialog.style.opacity = "1";
        });
      }
    } else {
      centerDialog(tutorialDialog);
      requestAnimationFrame(() => {
        tutorialDialog.style.opacity = "1";
      });
    }

    // 特定要素のクリック待ち (waitForClickOn)
    if (subStep && subStep.waitForClickOn) {
      const targetEl = document.querySelector(subStep.waitForClickOn);
      if (targetEl) {
        handleClick = () => {
          hideTutorialDialog({
            ok: true,
            cancel: false,
            skipCheck: skipCheck && skipCheck.checked
          });
        };
        targetEl.addEventListener("click", handleClick);
      }
    }

    // モーダルが開いていたらチュートリアルのクリックを透過させるため監視
    startModalCheck();
  }

  function hideTutorialDialog(actionObj) {
    // ハイライト解除
    if (highlightEl) {
      highlightEl.classList.remove("tutorial-highlight");
      highlightEl = null;
    }

    // waitForClickOnのリスナを解除
    if (handleClick && currentSubStep && currentSubStep.waitForClickOn) {
      const tEl = document.querySelector(currentSubStep.waitForClickOn);
      if (tEl) {
        tEl.removeEventListener("click", handleClick);
      }
      handleClick = null;
    }

    // 閉じる
    tutorialDialog.style.display = "none";
    tutorialDialog.style.opacity = "0";
    tutorialOverlay.style.display = "none";
    stopModalCheck();

    // コールバック呼び出し
    if (onCloseCallback) {
      onCloseCallback(actionObj);
    }
    //onCloseCallback = null;
    //currentSubStep = null;
  }

  function buildDialogHTML(title, message) {
    return `
      <h2 style="margin-top:0;">${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <div style="margin:8px 0; display:flex; align-items:center;">
        <input type="checkbox" id="tutorial-skip-checkbox" />
        <label for="tutorial-skip-checkbox">次は表示しない</label>
      </div>
      <div style="display:flex; justify-content:center; gap:10px;">
        <button id="tutorial-next-btn">次へ</button>
        <button id="tutorial-cancel-btn">キャンセル</button>
      </div>
    `;
  }

  // -------------------------------------------
  // F) モーダルを監視
  // -------------------------------------------
  function startModalCheck() {
    stopModalCheck();
    modalCheckInterval = setInterval(() => {
      const isModalOpen = !!document.querySelector(".modal.active");
      tutorialOverlay.style.pointerEvents = isModalOpen ? "none" : "auto";
    }, 300);
  }

  function stopModalCheck() {
    if (modalCheckInterval) {
      clearInterval(modalCheckInterval);
      modalCheckInterval = null;
    }
  }

  // -------------------------------------------
  // G) 位置調整やユーティリティ類
  // -------------------------------------------
  function waitForScrollEnd(el, callback) {
    let stableCount = 0;
    let lastTop = null;
    function step() {
      const rect = el.getBoundingClientRect();
      const currentTop = rect.top;
      if (lastTop !== null && Math.abs(currentTop - lastTop) < 0.5) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      lastTop = currentTop;
      if (stableCount > 5) {
        callback();
      } else {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  function positionDialogAvoidOverlap(dialog, highlightEl) {
    const rect = highlightEl.getBoundingClientRect();
    const dw = dialog.offsetWidth;
    const dh = dialog.offsetHeight;

    // 下に配置できるか判定
    const spaceBelow = window.innerHeight - rect.bottom;
    let topPos;
    if (spaceBelow > dh + 10) {
      topPos = rect.bottom + 10;
    } else {
      topPos = rect.top - dh - 10;
    }
    if (topPos < 0) topPos = 0;

    let leftPos = rect.left;
    if (leftPos + dw > window.innerWidth) {
      leftPos = window.innerWidth - dw - 10;
    }
    if (leftPos < 0) leftPos = 0;

    dialog.style.top = topPos + "px";
    dialog.style.left = leftPos + "px";

    // 被りがあれば横ずらし
    const boxRect = dialog.getBoundingClientRect();
    if (checkOverlap(rect, boxRect)) {
      shiftHorizontally(dialog, rect, boxRect);
      clipToViewport(dialog);
    } else {
      clipToViewport(dialog);
    }
  }

  function checkOverlap(r1, r2) {
    const overlapX = (r1.left < r2.right) && (r1.right > r2.left);
    const overlapY = (r1.top < r2.bottom) && (r1.bottom > r2.top);
    return overlapX && overlapY;
  }

  function shiftHorizontally(dialog, hlRect, boxRect) {
    const highlightCenterX = (hlRect.left + hlRect.right) / 2;
    const screenCenterX = window.innerWidth / 2;
    const dw = boxRect.width;
    let newLeft;
    if (highlightCenterX < screenCenterX) {
      newLeft = hlRect.right + 10;
    } else {
      newLeft = hlRect.left - dw - 10;
    }
    if (newLeft < 0) newLeft = 0;
    if (newLeft + dw > window.innerWidth) {
      newLeft = window.innerWidth - dw - 10;
    }
    dialog.style.left = newLeft + "px";
  }

  function clipToViewport(dialog) {
    const boxRect = dialog.getBoundingClientRect();
    const dw = boxRect.width;
    const dh = boxRect.height;
    let topPos = boxRect.top;
    let leftPos = boxRect.left;

    if (topPos < 0) topPos = 0;
    if (topPos + dh > window.innerHeight) {
      topPos = window.innerHeight - dh - 10;
      if (topPos < 0) topPos = 0;
    }
    if (leftPos < 0) leftPos = 0;
    if (leftPos + dw > window.innerWidth) {
      leftPos = window.innerWidth - dw - 10;
      if (leftPos < 0) leftPos = 0;
    }
    dialog.style.top = topPos + "px";
    dialog.style.left = leftPos + "px";
  }

  function centerDialog(dialog) {
    const dw = dialog.offsetWidth;
    const dh = dialog.offsetHeight;
    let topPos = (window.innerHeight - dh) / 2;
    let leftPos = (window.innerWidth - dw) / 2;
    if (topPos < 0) topPos = 0;
    if (leftPos < 0) leftPos = 0;
    dialog.style.top = topPos + "px";
    dialog.style.left = leftPos + "px";
  }

  function getCurrentPageName() {
    return location.pathname.split("/").pop();
  }

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function getStoryIdNumber(storyId) {
    const match = storyId.match(/\d+$/);
    return match ? parseInt(match[0], 10) : 999999;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

})();
