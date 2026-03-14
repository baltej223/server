import crypto from "crypto";


export default function verifyGithubWebhook(req: any) {
  const signature = req.headers["x-hub-signature-256"];

  if (!signature) return false;

  const secret = process.env.REDEPLOY_SECRET!;

  const hmac = crypto.createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(req.rawBody).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}
