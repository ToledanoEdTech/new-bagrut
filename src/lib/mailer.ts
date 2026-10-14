import nodemailer from "nodemailer";

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendMailResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

function getSmtpConfig() {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_APP_PASSWORD?.trim();
  const from = process.env.MAIL_FROM?.trim() || user;

  if (!user || !pass) {
    return { ok: false as const, error: "SMTP_USER או SMTP_APP_PASSWORD חסרים" };
  }
  if (!from) {
    return { ok: false as const, error: "MAIL_FROM חסר" };
  }

  return {
    ok: true as const,
    user,
    pass,
    from,
  };
}

export function getMailFrom(): string | null {
  return process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || null;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const config = getSmtpConfig();
  if (!config.ok) return config;

  try {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    const info = await transport.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    return { ok: true, messageId: info.messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאת שליחת מייל";
    return { ok: false, error: msg };
  }
}
