const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendNotification = functions
  .region("asia-southeast1")
  .database.ref("/rooms/{roomId}/messages/{messageId}")
  .onCreate(async (snapshot, context) => {
    const message = snapshot.val();
    const { roomId } = context.params;
    const senderId = message.sender;

    const membersSnap = await admin
      .database()
      .ref("rooms/" + roomId + "/members")
      .once("value");
    const members = membersSnap.val() || {};

    const tokens = [];
    for (const [uid, data] of Object.entries(members)) {
      if (uid !== senderId && data.fcmToken) {
        tokens.push(data.fcmToken);
      }
    }

    if (tokens.length === 0) return null;

    const senderAvatar = message.avatar || "😊";

    const payload = {
      notification: {
        title: senderAvatar + " emojidm",
        body: message.emoji,
      },
      webpush: {
        fcmOptions: {
          link: "https://honeypawlab.com/emoji-dm/",
        },
      },
    };

    const results = await Promise.allSettled(
      tokens.map(function (token) {
        return admin.messaging().send(Object.assign({}, payload, { token: token }));
      })
    );

    var failedTokens = [];
    results.forEach(function (result, i) {
      if (result.status === "rejected") {
        var code = result.reason && result.reason.code;
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          failedTokens.push(tokens[i]);
        }
      }
    });

    if (failedTokens.length > 0) {
      var updates = {};
      for (const [uid, data] of Object.entries(members)) {
        if (failedTokens.includes(data.fcmToken)) {
          updates["rooms/" + roomId + "/members/" + uid + "/fcmToken"] = null;
        }
      }
      await admin.database().ref().update(updates);
    }

    return null;
  });
