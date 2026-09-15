#!/usr/bin/env node

import { randomBytes } from "node:crypto";

import webPush from "web-push";

const { publicKey, privateKey } = webPush.generateVAPIDKeys();
const encryptionKey = randomBytes(32).toString("base64");

const lines = [
  "# Copy these values directly into the deployment secret store.",
  "# Do not commit the private values to the repository.",
  `PRODUCTION_INTEGRATION_ENCRYPTION_KEY=${encryptionKey}`,
  "PRODUCTION_WEB_PUSH_VAPID_SUBJECT=mailto:replace-with-operator-email@example.com",
  `PRODUCTION_WEB_PUSH_VAPID_PUBLIC_KEY=${publicKey}`,
  `PRODUCTION_WEB_PUSH_VAPID_PRIVATE_KEY=${privateKey}`,
];

process.stdout.write(`${lines.join("\n")}\n`);
