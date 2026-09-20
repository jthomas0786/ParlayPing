const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function read(rel){return fs.readFileSync(path.join(__dirname,'..',rel),'utf8');}

test('launch readiness is manual-only, no-post, and requires both X gates explicitly off',()=>{
  const yaml=read('.github/workflows/parlayping-x-readiness.yml');
  const triggerBlock=yaml.match(/\non:\s*\n([\s\S]*?)\npermissions:/)?.[1]||'';
  assert.match(triggerBlock,/workflow_dispatch:/);
  assert.doesNotMatch(triggerBlock,/schedule:/);
  assert.doesNotMatch(yaml,/(?:-X|--request)\s+POST\b/i);
  assert.match(yaml,/probe=auth/);
  assert.match(yaml,/approvalRecorded !== false/);
  assert.match(yaml,/autoReplyEnabled !== false/);
  assert.match(yaml,/postingReady !== false/);
  assert.match(yaml,/postingActive !== false/);
  assert.match(yaml,/xApprovalRecorded !== false/);
  assert.match(yaml,/String\(payload\.username \|\| ''\)\.toLowerCase\(\) !== 'parlayping'/);
});

test('GitHub mention workflow is manual-only, serialized, and never becomes a second active scheduler',()=>{
  const yaml=read('.github/workflows/parlayping-x-mentions.yml');
  const triggerBlock=yaml.match(/\non:\s*\n([\s\S]*?)\npermissions:/)?.[1]||'';
  assert.match(triggerBlock,/workflow_dispatch:/);
  assert.doesNotMatch(triggerBlock,/schedule:/);
  assert.match(yaml,/group:\s*parlayping-x-mentions/);
  assert.match(yaml,/cancel-in-progress:\s*false/);
  assert.doesNotMatch(yaml,/--retry(?:-|\s|$)/);
  assert.doesNotMatch(yaml,/(?:-X|--request)\s+POST\b/i);
  assert.match(yaml,/x-parlayping-secret/);
});

test('launch checklist preserves two-gate activation and rollback order',()=>{
  const checklist=read('.github/PARLAYPING-LAUNCH-CHECKLIST.md');
  assert.match(checklist,/`X_AI_REPLY_APPROVED=false`/);
  assert.match(checklist,/`X_AUTOREPLY_ENABLED=false`/);
  assert.match(checklist,/Both flags must be true before the worker may post/);
  const approval=checklist.indexOf('Set `X_AI_REPLY_APPROVED=true`');
  const autoreply=checklist.indexOf('Set `X_AUTOREPLY_ENABLED=true`');
  assert.ok(approval>=0&&autoreply>approval,'approval gate must be enabled before autoreply gate');
  assert.match(checklist,/Set `X_AUTOREPLY_ENABLED=false` immediately/);
});
