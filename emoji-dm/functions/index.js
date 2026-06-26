const { onValueCreated } = require("firebase-functions/v2/database");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

exports.sendNotification = onValueCreated(
  { ref: "/rooms/{roomId}/messages/{messageId}", region: "asia-southeast1" },
  async (event) => {
    const message = event.data.val();
    const { roomId } = event.params;
    const senderId = message.sender;

    const membersSnap = await getDatabase()
      .ref(`rooms/${roomId}/members`)
      .once("value");
    const members = membersSnap.val() || {};

    const tokens = [];
    for (const [uid, data] of Object.entries(members)) {
      if (uid !== senderId && data.fcmToken) {
        tokens.push(data.fcmToken);
      }
    }

    if (tokens.length === 0) return;

    const senderAvatar = message.avatar || "😊";

    const payload = {
      notification: {
        title: `${senderAvatar} emojidm`,
        body: message.emoji,
      },
      webpush: {
        fcmOptions: {
          link: `https://honeypawlab.com/emoji-dm/`,
        },
      },
    };

    const results = await Promise.allSettled(
      tokens.map((token) =>
        getMessaging().send({ ...payload, token })
      )
    );

    const failedTokens = [];
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        const code = result.reason?.code;
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          failedTokens.push(tokens[i]);
        }
      }
    });

    if (failedTokens.length > 0) {
      const updates = {};
      for (const [uid, data] of Object.entries(members)) {
        if (failedTokens.includes(data.fcmToken)) {
          updates[`rooms/${roomId}/members/${uid}/fcmToken`] = null;
        }
      }
      await getDatabase().ref().update(updates);
    }
  }
);
