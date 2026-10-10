'use strict';
// TSO first-party identity verifier: verifies the bearer with its own Supabase
// Auth server; never trusts a posted userId/email, a decoded JWT alone, or a
// browser-side identity claim. PP accounts continue on their own provider.
const {requireUser}=require('./supabase-account');
const TSO_AUTH_URL='https://hjhfbhpuuxnrexddplxd.supabase.co/auth/v1/user';
const PUBLIC_TSO_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqaGZiaHB1dXhucmV4ZGRwbHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0OTY5ODQsImV4cCI6MjEwMjA3Mjk4NH0.6URv-aSJgFupp1dkO65AsTqPpZF_aUckczhxJZBWVJ0'; // Public Supabase anon key, not service_role.
async function requireHostUser(req){
  if(String(req?.headers?.['x-parlayping-identity']||'').toLowerCase()!=='tso2')
    return requireUser(req);
  const authorization=String(req?.headers?.authorization||'');
  if(!/^Bearer\s+[^\s]{60,5000}$/i.test(authorization)){
    const error=new Error('The Sports Outpost login is required.');error.status=401;throw error;
  }
  const response=await fetch(TSO_AUTH_URL,{
    headers:{authorization,apikey:PUBLIC_TSO_ANON_KEY},
    cache:'no-store',signal:AbortSignal.timeout(8000)
  });
  if(!response.ok){const error=new Error('The Sports Outpost session is not valid.');error.status=401;throw error;}
  const user=await response.json();
  if(!/^[0-9a-f-]{36}$/i.test(user?.id||'')){
    const error=new Error('The Sports Outpost session could not be verified.');error.status=401;throw error;
  }
  return {token:authorization,user,identityProvider:'tso2'};
}
module.exports={requireHostUser};
