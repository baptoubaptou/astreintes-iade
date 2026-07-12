import { Resend } from "resend";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
};

export type EmailEnvoiPayload = {
  to: string;
  subject: string;
  body: string;
  idempotencyKey?: string;
  attachments?: EmailAttachment[];
};

type EmailEnvoiResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

function getExpediteur(): string | null {
  const from = process.env.RESEND_FROM?.trim();
  return from && from.length > 0 ? from : null;
}

export async function envoyerEmailResend(
  payload: EmailEnvoiPayload,
): Promise<EmailEnvoiResult> {
  const client = getResendClient();
  const from = getExpediteur();

  if (!client) {
    return { ok: false, error: "RESEND_API_KEY manquante." };
  }

  if (!from) {
    return { ok: false, error: "RESEND_FROM manquant." };
  }

  const options = payload.idempotencyKey
    ? { idempotencyKey: payload.idempotencyKey }
    : undefined;

  const { data, error } = await client.emails.send(
    {
      from,
      to: [payload.to],
      subject: payload.subject,
      text: payload.body,
      attachments: payload.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
      })),
    },
    options,
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, id: data?.id };
}

export function emailResendConfigure(): boolean {
  return Boolean(getResendClient() && getExpediteur());
}
