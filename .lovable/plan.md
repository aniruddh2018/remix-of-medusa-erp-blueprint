
Root cause identified:
- Your user record is currently in a broken state: role is `admin` but `profiles.company_id` is `NULL`.
- App routing sends any logged-in non-super-admin with `company_id = NULL` back to onboarding, so it loops forever.
- Current onboarding flow is fragile because it does 3 client-side writes (`companies` → `profiles` → `user_roles`) and can “partially succeed” without guaranteeing profile linking.

Implementation plan

1) Make onboarding atomic in backend (single transaction)
- Add a DB function `public.complete_onboarding(company_name text, business_type text)` (security definer).
- Function steps:
  - Validate authenticated user.
  - If user already has `company_id`, return it (idempotent).
  - Insert company and capture new `company_id`.
  - Update that user’s profile with `company_id` + `business_module`.
  - Promote role to admin safely (staff→admin, or insert admin if missing).
  - Return `company_id`.
- This removes partial-write failures and prevents loops.

2) Update onboarding page to call only this function
- In `src/pages/Onboarding.tsx`, replace current multi-query client logic with one RPC call.
- Keep loader + toast, but fail hard if RPC doesn’t return company id.
- Keep full reload after success so contexts refresh cleanly.

3) Add onboarding route guards (prevent false loops)
- In `Onboarding.tsx`, redirect:
  - unauthenticated users → `/auth`
  - users who no longer need onboarding → `/`
- This prevents stale `/onboarding` URL from trapping users after setup.

4) Harden error observability
- Show clear error toast text from RPC failures.
- Log structured details (`step`, `message`) for easier future debugging.

5) Validate end-to-end
- Login with affected account.
- Complete onboarding once.
- Refresh and re-login: must land on dashboard, not onboarding.
- Confirm settings changes persist after refresh.
- Confirm role remains admin in UI and backend.

Technical details
- This follows current multi-tenant model where `profiles.company_id` is the onboarding gate.
- It preserves RLS safety by centralizing privileged onboarding writes in a controlled backend function.
- It avoids the current client-side “multi-call consistency gap” that allows company creation without guaranteed profile linkage.
- No role data is moved to profile/users table; roles remain in `user_roles`.
