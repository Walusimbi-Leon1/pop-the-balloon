/**
 * Pop the Balloon — Discord Embedded App SDK
 */

const CLIENT_ID = "1517048814513422467"; // Reuse Pop Party's Discord app

export let isDiscord = false;
export let channelId = "lobby";
export let playerName = "Player";
export let playerId = "anon-" + Math.random().toString(36).slice(2, 9);
export let playerAvatar = null;

export async function initDiscord() {
  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@1.8.0/+esm");
    const { DiscordSDK } = mod;
    const discordSdk = new DiscordSDK(CLIENT_ID);
    await discordSdk.ready();
    isDiscord = true;

    try {
      await discordSdk.commands.authorize({
        client_id: CLIENT_ID,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify"],
      });
    } catch { /* may be handled by Discord context */ }

    let room = "lobby";
    try {
      const channel = await discordSdk.commands.getChannelId();
      if (channel?.channelId) room = channel.channelId;
    } catch { /* not in channel context */ }

    try {
      const { user } = await discordSdk.commands.authenticate({});
      if (user) {
        playerName = user.global_name || user.username || "Player";
        playerId = user.id || "discord-" + Math.random().toString(36).slice(2, 9);
        playerAvatar = user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
          : null;
      }
    } catch { /* auth skipped */ }

    channelId = room;
    return { isDiscord: true, channelId, playerName, playerId, playerAvatar };
  } catch (err) {
    console.warn("[Discord] Not in Discord:", err.message);
    isDiscord = false;
    channelId = "lobby";
    playerName = "Guest " + Math.floor(Math.random() * 1000);
    return { isDiscord: false, channelId: "lobby", playerName, playerId, playerAvatar: null };
  }
}
