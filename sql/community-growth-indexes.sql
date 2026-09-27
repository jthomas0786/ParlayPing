-- Performance index added after the Founding 100 / referral launch.
-- Covers member_referrals.referrer_user_id for invite-count and attribution lookups.
create index if not exists member_referrals_referrer_user_id_idx
  on public.member_referrals(referrer_user_id);
