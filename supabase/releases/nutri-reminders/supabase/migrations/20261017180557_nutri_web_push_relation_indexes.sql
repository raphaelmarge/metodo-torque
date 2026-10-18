-- Additive follow-up: the initial reminder migration has already been applied.
-- Full indexes also cover inactive rows during FK cascades and account cleanup.
begin;
create index nutri_push_preferences_patient_idx
 on private.nutri_push_preferences(patient_id);
create index nutri_push_subscriptions_patient_idx
 on private.nutri_push_subscriptions(patient_id);
-- The leading user_id supports its FK and the per-user device limit. Both
-- columns serve snapshot/preferences/revocation filters for a patient account.
create index nutri_push_subscriptions_user_patient_idx
 on private.nutri_push_subscriptions(user_id,patient_id);
commit;
