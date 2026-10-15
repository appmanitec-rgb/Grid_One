export const PROFILE_UPDATED_EVENT = "manitec:profile-updated";
export const PROFILE_REVISION_KEY = "manitec_profile_revision";

export type CurrentProfile = {
  id: string;
  name: string;
  profilePhotoUrl?: string | null;
};

export function publishProfileUpdate(profile: CurrentProfile) {
  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: profile }));
  // Other tabs reload the saved profile; the photo is never duplicated in storage.
  try { localStorage.setItem(PROFILE_REVISION_KEY, String(Date.now())); } catch {}
}
