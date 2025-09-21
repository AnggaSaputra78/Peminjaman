// firebase.js
import admin from "firebase-admin";
import { readFileSync } from "fs";

const serviceAccount = JSON.parse(
  readFileSync("./device-lending-firebase-adminsdk-fbsvc-d72e6a00db.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore(); // Firestore instance untuk server
export default db;
