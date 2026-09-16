'use strict';
// Use visible tabs and summaries; inaccessible controls must still fail.
async function clickPlayer(page, selector) {
  const target = page.locator(selector);
  if (!await target.isVisible()) {
    const panel = target.locator('xpath=ancestor::*[@role="tabpanel"]');
    if (await panel.count()) {
      const tab = await panel.first().getAttribute('aria-labelledby');
      await page.locator('#' + tab).click();
    }
    const ancestors = target.locator('xpath=ancestor::details');
    for (let i = 0; i < await ancestors.count(); i++) {
      const details = ancestors.nth(i);
      if (!await details.evaluate(node => node.open)) await details.locator(':scope > summary').click();
    }
  }
  await target.click();
}
module.exports = { clickPlayer };
