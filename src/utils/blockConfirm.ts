// Shared by GridPage, GridProfilePage, ChatThreadPanel (read before blocking/
// unblocking) and BehaviorPage (the direct settings toggle) so they
// all agree on the same localStorage keys. App-wide, not per profile.
export const SKIP_BLOCK_CONFIRM_KEY = "profile_skip_block_confirm";
export const SKIP_UNBLOCK_CONFIRM_KEY = "profile_skip_unblock_confirm";
// Shared by ChatThreadPanel (overflow menu delete) and ChatInboxPanel
// (context menu / swipe delete) so "don't ask again" applies everywhere a
// conversation can be deleted from, not just the place it was checked.
export const SKIP_DELETE_CONVERSATION_CONFIRM_KEY = "chat_skip_delete_conversation_confirm";
