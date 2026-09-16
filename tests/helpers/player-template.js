/* Navegação real do template aprovado. Não grava dados nem força cliques ocultos. */
'use strict';
async function abrirRegistro(page) {
  if (!await page.locator('#gKg').count() || await page.isVisible('#gKg')) return;
  const index = await page.evaluate(() => {
    const s = window.__gvDe(), f = window.GUIA[s.f];
    const it = f && f.it[Math.min(s.e, f.it.length - 1)];
    return it ? window.SR.indice(it) : null;
  });
  if (index == null) throw new Error('Nenhuma série disponível para abrir o registro');
  await page.locator('[data-gserie="' + index + '"]').click();
  await page.locator('#gKg').waitFor({ state: 'visible' });
}
async function clicarControle(page, selector) {
  await abrirRegistro(page);
  const control = page.locator(selector);
  const parents = control.locator('xpath=ancestor::details');
  for (let i = 0; i < await parents.count(); i++) {
    const parent = parents.nth(i);
    if (!await parent.evaluate(e => e.open)) await parent.locator(':scope > summary').click();
  }
  await control.click();
}
async function preencherRegistro(page, selector, value) {
  await abrirRegistro(page);
  await page.fill(selector, value);
}
module.exports = { abrirRegistro, clicarControle, preencherRegistro };
