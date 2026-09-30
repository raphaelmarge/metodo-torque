'use strict';
// Local, mandatory release inputs. A missing/changed package never falls back to a proposal.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const lf = value => value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const configs = {
  ops: { folder: 'hq-admin-minimal', mode: 'existing-admin-only', sources: [
    ['supabase/hq-ops-proposal.sql', /^migrations\/[0-9]{14}_hq_ops_admin_minimal\.sql$/]
  ] },
  referrals: { folder: 'hq-referrals-optional', mode: 'referrals-optional-separate-approval', sources: [
    ['supabase/migrations/20260930193716_hq_referrals_ledger.sql', /^migrations\/20260930193716_hq_referrals_ledger\.sql$/],
    ['supabase/hq-referrals-payment-contract-proposal.sql', /^migrations\/[0-9]{14}_hq_referrals_payment_contract\.sql$/]
  ] },
  influencer: { folder: 'hq-influencer-optional', mode: 'influencer-optional-blocked', sources: [
    ['supabase/hq-influencer-portal-proposal.sql', /^migrations\/[0-9]{14}_hq_influencer_portal_contract\.sql$/]
  ] }
};
function loadPackages() {
  return Object.fromEntries(Object.entries(configs).map(([name, config]) => {
    const folder = path.join(ROOT, 'supabase/releases', config.folder);
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.mode, config.mode);
    assert.equal(manifest.baseCommit, 'b05222a2852bd1e96d9a91804d3cd5bdd4f59d22');
    assert.equal(manifest.targetProjectRef, 'hdcufkaalxfhwmfwoiqp'); // Metadata only: NEVER a network target.
    assert.equal(manifest.status, 'local-preparation-not-applied');
    assert.equal(manifest.approvalRequired, true);
    assert.equal(manifest.encoding, 'UTF-8');
    assert.equal(manifest.lineEndings, 'LF');
    assert.equal(manifest.hashAlgorithm, 'SHA-256');
    if (name === 'ops') assert.equal(manifest.staffEnabled, false);
    else {
      for (const key of ['approvalSeparate', 'activationBlocked', 'frontendReleaseRequired']) assert.equal(manifest[key], true);
      assert.equal(manifest.campaignEnabled, false);
      if (name === 'influencer') { assert.equal(manifest.uiEnabled, false); assert.equal(manifest.externalPrereqsAuth, true); }
    }
    const entries = manifest.migrations || [manifest.migration];
    assert.equal(entries.length, config.sources.length);
    assert.deepEqual(manifest.migrationAllowlist, entries.map(e => e.file));
    const files = ['manifest.json'];
    function checked(entry, source, pattern) {
      assert.equal(entry.source, source);
      assert.match(entry.file, pattern);
      assert.match(entry.sha256, /^[a-f0-9]{64}$/);
      const full = path.resolve(folder, entry.file);
      assert(full.startsWith(folder + path.sep));
      assert(fs.lstatSync(full).isFile() && !fs.lstatSync(full).isSymbolicLink());
      const bytes = fs.readFileSync(full);
      const sql = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      assert(!sql.startsWith('\uFEFF') && !sql.includes('\r'));
      assert.equal(sql, lf(fs.readFileSync(path.join(ROOT, source), 'utf8')));
      assert.equal(sha(bytes), entry.sha256);
      files.push(entry.file);
      return sql;
    }
    const migrations = entries.map((entry, i) => checked(entry, ...config.sources[i]));
    assert.deepEqual(Object.keys(manifest.rollback).sort(), ['resume', 'suspend']);
    const rollback = Object.fromEntries(['suspend', 'resume'].map(mode => {
      const file = 'rollback/hq-' + name + '-' + mode + '.sql';
      assert.equal(manifest.rollback[mode].file, file);
      return [mode, checked(manifest.rollback[mode], 'supabase/' + file, /^rollback\/hq-(ops|referrals|influencer)-(suspend|resume)\.sql$/)];
    }));
    function walk(dir, prefix = '') {
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        assert(!entry.isSymbolicLink());
        const relative = prefix + entry.name;
        if (entry.isDirectory()) { assert(['migrations', 'rollback'].includes(relative)); return walk(path.join(dir, entry.name), relative + '/'); }
        assert(entry.isFile()); return [relative];
      });
    }
    assert.deepEqual(walk(folder).sort(), files.sort());
    return [name, { migrations, rollback, metadata: { module: name, migrationHashes: entries.map(e => e.sha256) } }];
  }));
}
module.exports = { loadPackages };
if (require.main === module) { loadPackages(); console.log('PASS: three mandatory versioned packages, exact allowlists/LF/source hashes'); }
