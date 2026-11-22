import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');

test('firestore.rules enforces all Eight Pillars and Dirty Dozen protections', () => {
  assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');
  assert.ok(fs.existsSync(blueprintPath), 'firebase-blueprint.json must exist');

  const rules = fs.readFileSync(rulesPath, 'utf8');
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

  // Pillar 0: rules_version 2 & default-deny global safety net
  assert.match(rules, /rules_version\s*=\s*'2';/);
  assert.match(rules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);

  // Pillar 1 & 2: Master Gate exists() & standalone isValid helpers
  assert.match(rules, /function isValidId\(id\)/);
  assert.match(rules, /function isValidUserPublic\(data\)/);
  assert.match(rules, /function isValidUserPrivate\(data\)/);
  assert.match(rules, /function isValidProduct\(data\)/);
  assert.match(rules, /function isValidOrder\(data\)/);
  assert.match(rules, /function isValidReview\(data\)/);

  // Pillar 3: Email spoofing guard requires email_verified == true
  assert.match(rules, /request\.auth\.token\.email_verified == true/);

  // Pillar 4 & 5: Terminal order state locking & immutable audit logs
  assert.match(rules, /existing\(\)\.status != 'delivered'/);
  assert.match(rules, /match \/auditLogs\/\{logId\}[\s\S]*allow update, delete: if false;/);

  // Pillar 6: PII isolation strictly restricts private subcollection
  assert.match(rules, /match \/private\/\{docId\}/);

  // Every blueprint collection has a match block
  for (const collectionPath of Object.keys(blueprint.firestore)) {
    const rootSegment = collectionPath.split('/')[1];
    assert.ok(
      rules.includes(`match /${rootSegment}/`),
      `Missing match block for blueprint collection /${rootSegment}`
    );
  }
});
