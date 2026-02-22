/**
 * Returns the base URL for invite links.
 * Always uses the published domain so invitees don't hit
 * the Lovable preview (which requires project access).
 */
export const getInviteUrl = (token: string): string => {
  const PUBLISHED_ORIGIN = "https://condobunk.lovable.app";
  return `${PUBLISHED_ORIGIN}/invite/${token}`;
};
