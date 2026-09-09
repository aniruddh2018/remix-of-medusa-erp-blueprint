import { util } from '@aws-appsync/utils';

/**
 * Allow subscribe/publish only on the caller's own session channel
 * (/voice-agent/user/<supabase-user-id>/<sessionId>), or any channel when
 * the caller is the agent container itself (IAM auth).
 */
export function onSubscribe(ctx) {
  authorize(ctx);
}

export function onPublish(ctx) {
  authorize(ctx);
  return ctx.events;
}

function authorize(ctx) {
  if (ctx.identity.accountId) {
    // IAM auth (the agent container's own role) — allow any channel.
    return;
  }
  // OIDC auth (the browser) — Supabase's JWT `sub` claim is the user's UUID.
  const userId = ctx.identity.sub;
  if (userId && ctx.info.channel.path.startsWith(`/voice-agent/user/${userId}/`)) {
    return;
  }
  util.unauthorized();
}
