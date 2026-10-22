// Перевірка рівнів: еталонний розв'язок кожної станції має проходити
// всі сценарії (фіксовані й випадкові). Запуск: node tests/test_levels.js
const path = require("path");
const root = path.join(__dirname, "..");
global.window = global;
require(path.join(root, "vendor/skulpt/skulpt.min.js"));
require(path.join(root, "vendor/skulpt/skulpt-stdlib.js"));
global.Sk = window.Sk;
const { LEVELS, makeScenarios, runCode } = require(path.join(root, "js/core.js"));

(async () => {
  let failed = 0;
  for (const lv of LEVELS) {
    let runs = 0;
    for (let rep = 0; rep < 10; rep++) {
      const scs = makeScenarios(lv, rep > 0);
      for (let i = 0; i < scs.length; i++) {
        const r = await runCode(lv, scs[i], lv.solution);
        runs++;
        if (!r.res.ok) {
          failed++;
          console.log(`✗ ${lv.id} сценарій ${i + 1}: ${r.res.msg}`);
        }
      }
    }
    console.log(`${lv.id} ${lv.title}: ${runs} запусків`);
  }
  if (failed) { console.log(`\nПомилок: ${failed}`); process.exit(1); }
  console.log("\nУсі еталонні розв'язки проходять.");
})();
