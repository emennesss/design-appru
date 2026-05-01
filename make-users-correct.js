const admin = require("firebase-admin");

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString()
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function run() {
  const users = [
    {
      email: "mukundnshinde@gmail.com",
      role: "superadmin",
      side: "designer",
      name: "Mukund Shinde",
      tenantId: "default",
      designerOrgId: "default",
      status: "active",
    },
    {
      email: "emennesss@gmail.com",
      role: "designer_owner",
      side: "designer",
      name: "Designer",
      tenantId: "default",
      designerOrgId: "default",
      status: "active",
    },
  ];

  for (const u of users) {
    const email = u.email.toLowerCase();

    await db.collection("users").doc(email).set(
      {
        ...u,
        email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log("Updated:", email, "=>", u.role);
  }

  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
