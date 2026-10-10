const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','sql','api-partner-program.sql'),'utf8');

test('partner schema defaults to pending and has no public authorization policies',()=>{
  assert.match(sql,/status text not null default 'pending'/);
  assert.match(sql,/monthly_request_limit integer not null default 10000/);
  assert.match(sql,/custom_branding_approved boolean not null default false/);
  assert.match(sql,/approved_by uuid not null references auth\.users/);
  assert.match(sql,/expires_at timestamptz not null/);
  for(const table of ['partner_applications','partner_grants','partner_audit'])
    assert.match(sql,new RegExp('alter table parlayping_internal\\.'+table+' enable row level security'));
  assert.doesNotMatch(sql,/create policy/i);
});
