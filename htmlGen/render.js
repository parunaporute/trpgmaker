const nunjucks = require('nunjucks');
const fs = require('fs');
const path = require('path');

// 出力先フォルダのパス
const distPath = path.join(__dirname, '../');

// dist フォルダが存在しない場合は作成
if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
}

// Nunjucks の設定
nunjucks.configure('views', { autoescape: true });

// データを渡してレンダリング
const outputIndex           = nunjucks.render('index.njk');
const outputBookshelf       = nunjucks.render('bookshelf.njk');
const outputCharacterCreate = nunjucks.render('characterCreate.njk');
const outputPartyCreate     = nunjucks.render('partyCreate.njk');
const outputPartyList       = nunjucks.render('partyList.njk');
const outputScenario        = nunjucks.render('scenario.njk');
const outputScenarioWizard  = nunjucks.render('scenarioWizard.njk');
const outputCustomScenario  = nunjucks.render('customScenario.njk');
const outputTutorialList    = nunjucks.render('tutorialList.njk');

// 結果をファイルに保存
fs.writeFileSync(path.join(distPath, 'index.html'), outputIndex);
fs.writeFileSync(path.join(distPath, 'bookshelf.html'), outputBookshelf);
fs.writeFileSync(path.join(distPath, 'characterCreate.html'), outputCharacterCreate);
fs.writeFileSync(path.join(distPath, 'partyCreate.html'), outputPartyCreate);
fs.writeFileSync(path.join(distPath, 'partyList.html'), outputPartyList);
fs.writeFileSync(path.join(distPath, 'scenario.html'), outputScenario);
fs.writeFileSync(path.join(distPath, 'scenarioWizard.html'), outputScenarioWizard );
fs.writeFileSync(path.join(distPath, 'customScenario.html'), outputCustomScenario );
fs.writeFileSync(path.join(distPath, 'tutorialList.html'), outputTutorialList );

console.log('HTML を ' + distPath + 'に出力しました');
