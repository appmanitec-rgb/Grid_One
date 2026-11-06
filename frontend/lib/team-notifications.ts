export const TEAM_CHANNELS_UPDATED_EVENT = "manitec:team-channels-updated";
export const TEAM_ACTIVE_CHANNEL_EVENT = "manitec:team-active-channel";

export type TeamNotificationChannel = {
  id: string;
  name: string;
  directKey?: string | null;
  unreadCount: number;
  members?: Array<{ id: string; name: string }>;
  lastMessage?: { body: string; createdAt: string; author: { id: string; name: string } } | null;
};

export function conversationLabel(channel: TeamNotificationChannel, userId: string) {
  return channel.directKey
    ? channel.members?.find(member => member.id !== userId)?.name || channel.name
    : channel.name;
}

export function refreshTeamNotifications() {
  window.dispatchEvent(new Event(TEAM_CHANNELS_UPDATED_EVENT));
}
