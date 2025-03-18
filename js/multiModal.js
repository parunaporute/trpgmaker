// multiModal.js
// 複数同時表示を可能にする簡易サンプル

class ModalInstance {
  constructor(options) {
    this.options = { ...options };  // 必要に応じてデフォルトをマージ
    this.modalBackdrop = null;
    this.modalContainer = null;
    this.isOpen = false;
  }

  open() {
    // まだDOMを作っていなければ生成
    if (!this.modalBackdrop) {
      this.createDOM();
    }
    // オプションを反映
    this.applyAppearanceType(this.options.appearanceType || "center");
    this.fillContents();

    // z-index の上積み (他のモーダルより前面に出す)
    // 既存モーダル数に応じて足す方法など、色々工夫可
    const baseZ = 9999;
    const topZ = baseZ + getOpenedModalCount() * 2; 
    this.modalBackdrop.style.zIndex = topZ;
    this.modalContainer.style.zIndex = topZ + 1;

    // 表示
    this.modalBackdrop.style.display = "block";
    this.isOpen = true;

    // モーダル外クリックでキャンセル
    if (this.options.closeOnOutsideClick) {
      this.modalBackdrop.addEventListener("click", this.onBackdropClick);
    }
    // 管理用リストに追加
    addToGlobalModalList(this);
  }

  createDOM() {
    // バックドロップ
    this.modalBackdrop = document.createElement("div");
    this.modalBackdrop.className = "mmodal-backdrop";
    Object.assign(this.modalBackdrop.style, {
      position: "fixed",
      top: "0", left: "0",
      width: "100%", height: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      display: "none"
    });

    // コンテナ
    this.modalContainer = document.createElement("div");
    this.modalContainer.className = "mmodal-container";
    Object.assign(this.modalContainer.style, {
      position: "absolute",
      backgroundColor: "rgba(0,0,0,0.8)",
      color: "#fff",
      padding: "20px",
      borderRadius: "5px",
      maxWidth: "90%",
      boxSizing: "border-box"
    });

    // バックドロップにコンテナをネスト → body へ追加
    this.modalBackdrop.appendChild(this.modalContainer);
    document.body.appendChild(this.modalBackdrop);

    // bind用
    this.onBackdropClick = this.onBackdropClick.bind(this);
  }

  applyAppearanceType(type) {
    if (type === "center") {
      this.modalContainer.style.top = "50%";
      this.modalContainer.style.left = "50%";
      this.modalContainer.style.transform = "translate(-50%, -50%)";
    } else if (type === "top") {
      this.modalContainer.style.top = "10%";
      this.modalContainer.style.left = "50%";
      this.modalContainer.style.transform = "translate(-50%, 0)";
    }
    // ほかのデザインにも対応したければここで追加
  }

  fillContents() {
    // いったんコンテナ内クリア
    this.modalContainer.innerHTML = "";

    // タイトル
    if (this.options.title) {
      const h2 = document.createElement("h2");
      h2.textContent = this.options.title;
      this.modalContainer.appendChild(h2);
    }

    // 内容
    if (this.options.contentHtml) {
      const cdiv = document.createElement("div");
      cdiv.innerHTML = this.options.contentHtml;
      this.modalContainer.appendChild(cdiv);
    }

    // 右上×
    if (this.options.showCloseButton) {
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "×";
      Object.assign(closeBtn.style, {
        position: "absolute",
        top: "10px",
        right: "10px",
        background: "transparent",
        border: "none",
        color: "#fff",
        fontSize: "1.2rem",
        cursor: "pointer"
      });
      closeBtn.addEventListener("click", () => this.cancel());
      this.modalContainer.appendChild(closeBtn);
    }

    // ボタン群
    const btnArea = document.createElement("div");
    Object.assign(btnArea.style, {
      display: "flex",
      justifyContent: "center",
      gap: "10px",
      marginTop: "20px"
    });

    // その他ボタン
    if (Array.isArray(this.options.additionalButtons)) {
      for (const bcfg of this.options.additionalButtons) {
        const b = document.createElement("button");
        b.textContent = bcfg.label || "ボタン";
        b.addEventListener("click", () => {
          if (bcfg.onClick) bcfg.onClick();
        });
        btnArea.appendChild(b);
      }
    }

    // キャンセルボタン
    if (typeof this.options.cancelLabel === "string") {
      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = this.options.cancelLabel;
      cancelBtn.addEventListener("click", () => this.cancel());
      btnArea.appendChild(cancelBtn);
    }

    // OKボタン
    if (typeof this.options.okLabel === "string") {
      const okBtn = document.createElement("button");
      okBtn.textContent = this.options.okLabel;
      okBtn.addEventListener("click", () => this.ok());
      btnArea.appendChild(okBtn);
    }

    this.modalContainer.appendChild(btnArea);
  }

  onBackdropClick(e) {
    if (e.target === this.modalBackdrop) {
      this.cancel();
    }
  }

  ok() {
    // コールバック呼び出し → close
    if (this.options.onOk) {
      this.options.onOk();
    }
    this.close();
  }

  cancel() {
    // コールバック呼び出し → close
    if (this.options.onCancel) {
      this.options.onCancel();
    }
    this.close();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    // DOM除去
    if (this.modalBackdrop && this.modalBackdrop.parentNode) {
      this.modalBackdrop.parentNode.removeChild(this.modalBackdrop);
    }
    // モーダルリストから除去
    removeFromGlobalModalList(this);
  }
}

// 下記2つのヘルパーは「現在開いているモーダルの数」を確認するなどのためのもの。
const globalModalList = [];
function addToGlobalModalList(modalInstance) {
  globalModalList.push(modalInstance);
}
function removeFromGlobalModalList(modalInstance) {
  const i = globalModalList.indexOf(modalInstance);
  if (i >= 0) {
    globalModalList.splice(i, 1);
  }
}
function getOpenedModalCount() {
  return globalModalList.length;
}

// 使いやすいように export的なオブジェクトにまとめる
window.multiModal = {
  /**
   * newしてopenするだけのラッパ
   */
  open(options) {
    const m = new ModalInstance(options);
    m.open();
    return m; // この戻り値から m.close() なども可能
  }
};
  