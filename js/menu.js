// menu.js

// 「シナリオ」ボタン押下で scenario.html へ遷移
document.getElementById("scenario").addEventListener("click", function () {
    window.location.href = "scenario.html";
});

// APIキー設定
document.getElementById("set-api-key-button").addEventListener("click", function () {
    const apiKey = document.getElementById("api-key-input").value.trim();
    if (apiKey) {
        localStorage.setItem("apiKey", apiKey);
        alert("APIキーが設定されました。");
    } else {
        alert("APIキーを入力してください。");
    }
});

// APIキークリア
document.getElementById("clear-api-key-button").addEventListener("click", function () {
    const confirmClear = confirm("APIキーをクリアすると操作ができなくなります。よろしいですか？");
    if (confirmClear) {
        localStorage.removeItem("apiKey");
        alert("APIキーがクリアされました。");
    }
});

// ページ読み込み時にAPIキーを入力欄に表示
window.addEventListener("load", function () {
    const savedApiKey = localStorage.getItem("apiKey");
    if (savedApiKey) {
        document.getElementById("api-key-input").value = savedApiKey;
    }
});
