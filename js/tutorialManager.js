// tutorialManager.js
(function(){
  if (!window.tutorials || !Array.isArray(window.tutorials)) {
    console.warn("No tutorials found.");
    return;
  }

  document.addEventListener("DOMContentLoaded", initTutorial);

  function initTutorial() {
    // ----------------------------
    // 1) URLパラメータをチェック (forceTutorial=xxx)
    // ----------------------------
    const forcedTutorialId = getQueryParam("forceTutorial");
    if (forcedTutorialId) {
      const targetTutorial = window.tutorials.find(t => t.id === forcedTutorialId);
      if (targetTutorial) {
        runTutorialImmediately(targetTutorial);
      }
      return; // 他の取説は自動実行しない
    }

    // ----------------------------
    // 2) 通常実行ロジック
    //    「若いIDが未完了なら後のIDは実行しない」
    // ----------------------------
    const currentPage = getCurrentPageName();

    // 現在ページに合致するステップを持つ取説だけ抽出
    const pageTutorials = window.tutorials.filter(story =>
      story.steps.some(step => step.type === "page" && step.match === currentPage)
    );

    // IDの末尾数字が小さい順にソート ("story1" -> 1 ...)
    pageTutorials.sort((a, b) =>
      getStoryIdNumber(a.id) - getStoryIdNumber(b.id)
    );

    // 未完了のものを先頭から実行
    for (const story of pageTutorials) {
      const isCompleted = localStorage.getItem("completeStory_" + story.id) === "true";
      if (!isCompleted) {
        startTutorialSteps(story);
        break; // 1つ実行したら終了
      }
    }
  }

  /**
   * URLパラメータで強制指定された取説の実行
   */
  function runTutorialImmediately(story) {
    const currentPage = getCurrentPageName();
    // このページ向けのステップがあれば開始
    const hasCurrentPageStep = story.steps.some(
      step => step.type === "page" && step.match === currentPage
    );
    if (hasCurrentPageStep) {
      startTutorialSteps(story);
    }
  }

  /**
   * 取説のステップを開始
   */
  function startTutorialSteps(story) {
    // 「type=page & match=現在ページ」なステップを探す
    const step = story.steps.find(s => s.type === "page" && s.match === getCurrentPageName());
    if (!step) return;

    // subSteps が無ければ単発メッセージだけを表示
    if (!step.subSteps || step.subSteps.length === 0) {
      showDialogWithHighlight(story.title, step.message, null, (action)=>{
        // ★「次は表示しない」チェックがあれば completeStory_xxx をセット
        if (action.skipCheck) {
          localStorage.setItem("completeStory_" + story.id, "true");
          return;
        }
        // OK(次へ)なら完了
        if (action.ok) {
          localStorage.setItem("completeStory_" + story.id, "true");
        }
        // キャンセルなら何も保存しない(未完了)
      });
      return;
    }

    // subSteps がある場合は1つずつ実行
    let currentSub = 0;
    function showNextSub() {
      if (currentSub >= step.subSteps.length) {
        // 全部表示し終わったら完了
        localStorage.setItem("completeStory_" + story.id, "true");
        return;
      }
      const sub = step.subSteps[currentSub];
      showDialogWithHighlight(story.title, sub.message, sub.highlightSelector, (action)=>{
        // ★「次は表示しない」チェックがあれば即完了(残りのsubStepsはスキップ)
        if (action.skipCheck) {
          localStorage.setItem("completeStory_" + story.id, "true");
          return;
        }
        // 「次へ」
        if (action.ok) {
          currentSub++;
          showNextSub(); // 次へ
        } else {
          // cancel
          // → ここでは完了フラグは立てず中断
        }
      });
    }
    showNextSub();
  }

  // ===============================
  // ダイアログ表示関連
  // ===============================
  function showDialogWithHighlight(title, message, highlightSelector, onClose) {
    // オーバーレイ
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0,0,0,0.4)";
    overlay.style.zIndex = 9998;

    // ダイアログ
    const box = document.createElement("div");
    box.style.position = "absolute";
    box.style.zIndex = "10000";
    box.style.background = "rgb(255 242 207 / 88%)";
    box.style.color = "#000";
    box.style.padding = "15px";
    box.style.borderRadius = "2px";
    box.style.width = "300px";
    box.style.boxSizing = "border-box";
    box.style.opacity = "0";
    box.style.transition = "opacity 0.25s";

    const h2 = document.createElement("h2");
    h2.textContent = title;

    const p = document.createElement("p");
    p.textContent = message;

    // ▼ 「次は表示しない」チェックボックス（スキップフラグは使わず完了扱いにする）
    const skipWrap = document.createElement("div");
    skipWrap.style.margin = "8px 0";
    skipWrap.style.display = "flex";
    skipWrap.style.alignItems = "center";

    const skipCheck = document.createElement("input");
    skipCheck.type = "checkbox";
    skipCheck.id = "tutorial-skip-checkbox";

    const skipLabel = document.createElement("label");
    skipLabel.setAttribute("for", "tutorial-skip-checkbox");
    skipLabel.textContent = "次は表示しない";

    skipWrap.appendChild(skipCheck);
    skipWrap.appendChild(skipLabel);

    // ボタン
    const btnWrap = document.createElement("div");
    btnWrap.style.display = "flex";
    btnWrap.style.justifyContent = "center";
    btnWrap.style.gap = "10px";

    // 「次へ」ボタン
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "次へ";

    // 「キャンセル」ボタン
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "キャンセル";

    btnWrap.appendChild(nextBtn);
    btnWrap.appendChild(cancelBtn);

    // 組み立て
    box.appendChild(h2);
    box.appendChild(p);
    box.appendChild(skipWrap);
    box.appendChild(btnWrap);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // ハイライト処理
    let highlightEl = null;
    if (highlightSelector) {
      highlightEl = document.querySelector(highlightSelector);
      if (highlightEl) {
        highlightEl.classList.add("tutorial-highlight");
        highlightEl.scrollIntoView({ block:"center", inline:"center", behavior:"smooth" });
        waitForScrollEnd(highlightEl, () => {
          positionDialogWithAvoidOverlap(box, highlightEl);
          requestAnimationFrame(()=> {
            box.style.opacity="1";
          });
        });
      } else {
        positionCenter(box);
        requestAnimationFrame(()=> { box.style.opacity="1"; });
      }
    } else {
      positionCenter(box);
      requestAnimationFrame(()=> { box.style.opacity="1"; });
    }

    nextBtn.addEventListener("click", () => {
      closeDialog({
        ok: true,
        cancel: false,
        skipCheck: skipCheck.checked
      });
    });
    cancelBtn.addEventListener("click", () => {
      closeDialog({
        ok: false,
        cancel: true,
        skipCheck: skipCheck.checked
      });
    });

    function closeDialog(actionObj) {
      if (highlightEl) {
        highlightEl.classList.remove("tutorial-highlight");
      }
      document.body.removeChild(overlay);
      onClose && onClose(actionObj);
    }
  }

  /**
   * スクロール待ち
   */
  function waitForScrollEnd(el, onDone) {
    let stableCount = 0;
    let lastTop = null;
    function step() {
      const rect = el.getBoundingClientRect();
      const nowTop = rect.top;
      if (lastTop !== null && Math.abs(nowTop - lastTop) < 0.5) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      lastTop = nowTop;
      if (stableCount > 5) {
        onDone();
      } else {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  /**
   * ハイライト要素を避ける位置にダイアログを配置
   */
  function positionDialogWithAvoidOverlap(dialog, hlEl) {
    const rect = hlEl.getBoundingClientRect();
    const dw = dialog.offsetWidth;
    const dh = dialog.offsetHeight;

    // 下に置けるか、置けなければ上
    const spaceBelow = window.innerHeight - rect.bottom;
    let topPos;
    if (spaceBelow > dh + 10) {
      topPos = rect.bottom + 10;
    } else {
      topPos = rect.top - dh - 10;
    }

    let leftPos = rect.left;
    if (topPos < 0) topPos = 0;
    if (leftPos + dw > window.innerWidth) {
      leftPos = window.innerWidth - dw - 10;
    }
    if (leftPos < 0) leftPos = 0;

    dialog.style.top = topPos + "px";
    dialog.style.left = leftPos + "px";

    // 重なりチェック → 横ずらし
    const boxRect = dialog.getBoundingClientRect();
    if (checkOverlap(rect, boxRect)) {
      shiftHorizontallyToAvoidOverlap(dialog, rect, boxRect);
      finalClip(dialog);
    } else {
      finalClip(dialog);
    }
  }

  function checkOverlap(r1, r2) {
    const overlapX = (r1.left < r2.right) && (r1.right > r2.left);
    const overlapY = (r1.top < r2.bottom) && (r1.bottom > r2.top);
    return overlapX && overlapY;
  }

  function shiftHorizontallyToAvoidOverlap(dialog, highlightRect, boxRect) {
    const highlightCenterX = (highlightRect.left + highlightRect.right) / 2;
    const screenCenterX = window.innerWidth / 2;
    const dw = boxRect.width;

    let newLeft;
    if (highlightCenterX < screenCenterX) {
      // 右にずらす
      newLeft = highlightRect.right + 10;
    } else {
      // 左にずらす
      newLeft = highlightRect.left - dw - 10;
    }
    if (newLeft < 0) newLeft = 0;
    if (newLeft + dw > window.innerWidth) {
      newLeft = window.innerWidth - dw - 10;
    }
    dialog.style.left = newLeft + "px";
  }

  function finalClip(dialog) {
    const boxRect = dialog.getBoundingClientRect();
    let topPos = boxRect.top;
    let leftPos = boxRect.left;
    const dw = boxRect.width;
    const dh = boxRect.height;

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

  function positionCenter(dialog) {
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
})();
