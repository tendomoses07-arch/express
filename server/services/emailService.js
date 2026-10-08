/**
 * Kola Express Email Dispatch Service
 * Handles transactional emails, password recovery verification codes, and security alerts.
 * Supports production SMTP (Hostinger, SendGrid, Resend, etc.) and real test inboxes via Ethereal.
 */

const nodemailer = require('nodemailer');

const recentEmails = [];
const MAX_RECENT_EMAILS = 50;

let cachedTransporter = null;

function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return 'your registered email';
  }
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}${local[1]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Returns a configured Nodemailer transporter using server environment variables.
 * Falls back to verified test SMTP credentials if environment variables are unset.
 */
function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const host = process.env.SMTP_HOST || 'smtp.ethereal.email';
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER || 'cy2yhc4makjziu22@ethereal.email';
  const pass = process.env.SMTP_PASS || 'dGFYZgpXNQTYgSdQ2M';

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false
    }
  });

  return cachedTransporter;
}

/**
 * Sends customer email verification code (6 digits)
 */
async function sendEmailVerificationCode({ to, name, code }) {
  const recipientName = name ? name.split(' ')[0] : 'Valued Customer';
  const fromAddress = process.env.SMTP_FROM || '"Kola Express Security" <security@kolaexpress.ug>';
  const subject = `🔐 Verify Your Kola Express Account: ${code}`;

  const plainText = `
Hello ${recipientName},

Welcome to Kola Express! To verify your email address (${to}), please use your 6-digit verification code below:

Your verification code is:
${code}

This code is valid for 15 minutes.

If you did not register for an account with Kola Express, please ignore this email.

Sincerely,
The Kola Express Team
Kampala, Uganda | support@kolaexpress.ug
  `.trim();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Kola Express Email</title>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%); padding:28px 32px; text-align:center;">
              <div style="font-size:26px; font-weight:900; color:#ffffff; letter-spacing:-0.5px;">
                ⚡ KOLA<span style="color:#fbbf24;">EXPRESS</span>
              </div>
              <div style="color:#bfdbfe; font-size:13px; font-weight:600; margin-top:4px; text-transform:uppercase; letter-spacing:1px;">
                Email Verification
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 12px 0; font-size:20px; font-weight:700; color:#0f172a;">
                Welcome to Kola Express, ${recipientName}!
              </h2>
              <p style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#475569;">
                Please verify your email address to secure your account and access all delivery services across Kampala.
              </p>

              <!-- Code Box -->
              <div style="background-color:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:20px; text-align:center; margin:24px 0;">
                <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:#2563eb; letter-spacing:1.5px; margin-bottom:8px;">
                  Your 6-Digit Verification Code
                </div>
                <div style="font-size:36px; font-weight:900; letter-spacing:8px; color:#1d4ed8; font-family:'Courier New', monospace;">
                  ${code}
                </div>
                <div style="font-size:12px; color:#64748b; margin-top:8px;">
                  ⏱️ Valid for <strong>15 minutes</strong>
                </div>
              </div>

              <p style="margin:20px 0 0 0; font-size:13px; line-height:1.6; color:#64748b; background-color:#f8fafc; padding:12px 16px; border-radius:8px; border-left:4px solid #94a3b8;">
                🔒 If you did not create a Kola Express account, please disregard this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc; padding:20px 32px; border-top:1px solid #e2e8f0; text-align:center; font-size:12px; color:#94a3b8; line-height:1.5;">
              <div>&copy; 2026 Kola Express Delivery Service. Kampala, Uganda.</div>
              <div>Need assistance? Contact <a href="mailto:support@kolaexpress.ug" style="color:#2563eb; text-decoration:none;">support@kolaexpress.ug</a></div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const transporter = getTransporter();
  let messageId = null;
  let previewUrl = null;

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text: plainText,
      html: htmlContent
    });
    messageId = info.messageId;
    previewUrl = nodemailer.getTestMessageUrl(info) || null;
    console.log(`[Email Dispatch] Verification email dispatched to ${to} (MessageId: ${messageId})`);
    if (previewUrl) {
      console.log(`📬 [Real Inbox Preview URL]: ${previewUrl}`);
    }
  } catch (err) {
    console.error(`[Email Dispatch Error] Failed to send email to ${to}:`, err.message);
  }

  const emailRecord = {
    type: 'verification',
    to,
    recipientName,
    subject,
    code,
    messageId,
    previewUrl,
    sentAt: new Date().toISOString()
  };

  recentEmails.unshift(emailRecord);
  if (recentEmails.length > MAX_RECENT_EMAILS) recentEmails.pop();

  return {
    success: true,
    mode: 'smtp',
    messageId,
    previewUrl,
    code
  };
}

/**
 * Sends password recovery email with 6-digit verification code and secure reset link
 */
async function sendPasswordRecoveryEmail({ to, name, code, resetLink, token }) {
  const recipientName = name ? name.split(' ')[0] : 'Valued Customer';
  const fromAddress = process.env.SMTP_FROM || '"Kola Express Security" <security@kolaexpress.ug>';
  const subject = `🔐 Your Kola Express Password Recovery Code: ${code}`;

  const plainText = `
Hello ${recipientName},

We received a request to reset your password for your Kola Express account (${to}).

Your 6-digit recovery code is:
${code}

This code will expire in 15 minutes.

Alternatively, you can reset your password directly using this secure link:
${resetLink}

If you did not request a password reset, please ignore this email. Your current password remains secure.

Sincerely,
The Kola Express Security Team
Kampala, Uganda | support@kolaexpress.ug
  `.trim();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kola Express Password Recovery</title>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%); padding:28px 32px; text-align:center;">
              <div style="font-size:26px; font-weight:900; color:#ffffff; letter-spacing:-0.5px;">
                ⚡ KOLA<span style="color:#fbbf24;">EXPRESS</span>
              </div>
              <div style="color:#bfdbfe; font-size:13px; font-weight:600; margin-top:4px; text-transform:uppercase; letter-spacing:1px;">
                Account Security Center
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 12px 0; font-size:20px; font-weight:700; color:#0f172a;">
                Password Recovery Request
              </h2>
              <p style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#475569;">
                Hello <strong>${recipientName}</strong>,<br>
                We received a request to reset the password for your Kola Express account associated with <strong>${to}</strong>.
              </p>

              <!-- Code Box -->
              <div style="background-color:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:20px; text-align:center; margin:24px 0;">
                <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:#2563eb; letter-spacing:1.5px; margin-bottom:8px;">
                  Your 6-Digit Verification Code
                </div>
                <div style="font-size:36px; font-weight:900; letter-spacing:8px; color:#1d4ed8; font-family:'Courier New', monospace;">
                  ${code}
                </div>
                <div style="font-size:12px; color:#64748b; margin-top:8px;">
                  ⏱️ Valid for <strong>15 minutes</strong>
                </div>
              </div>

              <!-- Action Button -->
              <div style="text-align:center; margin:28px 0;">
                <a href="${resetLink}" style="display:inline-block; background-color:#2563eb; color:#ffffff; font-weight:700; font-size:15px; text-decoration:none; padding:12px 28px; border-radius:8px; box-shadow:0 4px 14px rgba(37, 99, 235, 0.4);">
                  Reset Password Directly &rarr;
                </a>
              </div>

              <p style="margin:20px 0 0 0; font-size:13px; line-height:1.6; color:#64748b; background-color:#f8fafc; padding:12px 16px; border-radius:8px; border-left:4px solid #94a3b8;">
                🔒 <strong>Security Notice:</strong> If you did not request this password recovery, please ignore this email. Your current password remains secure and will not change without this code.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc; padding:20px 32px; border-top:1px solid #e2e8f0; text-align:center; font-size:12px; color:#94a3b8; line-height:1.5;">
              <div>&copy; 2026 Kola Express Delivery Service. Kampala, Uganda.</div>
              <div>Need assistance? Contact <a href="mailto:support@kolaexpress.ug" style="color:#2563eb; text-decoration:none;">support@kolaexpress.ug</a></div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const transporter = getTransporter();
  let messageId = null;
  let previewUrl = null;

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text: plainText,
      html: htmlContent
    });
    messageId = info.messageId;
    previewUrl = nodemailer.getTestMessageUrl(info) || null;
    console.log(`[Email Dispatch] Successfully sent recovery email to ${to} (MessageId: ${messageId})`);
    if (previewUrl) {
      console.log(`📬 [Real Inbox Preview URL]: ${previewUrl}`);
    }
  } catch (err) {
    console.error(`[Email Dispatch SMTP Error] Failed to send via SMTP to ${to}:`, err.message);
  }

  const emailRecord = {
    type: 'recovery',
    to,
    recipientName,
    subject,
    code,
    resetLink,
    token,
    messageId,
    previewUrl,
    sentAt: new Date().toISOString()
  };

  recentEmails.unshift(emailRecord);
  if (recentEmails.length > MAX_RECENT_EMAILS) {
    recentEmails.pop();
  }

  return {
    success: true,
    mode: 'smtp',
    messageId,
    previewUrl,
    code,
    resetLink
  };
}

/**
 * Sends security confirmation after successful password reset
 */
async function sendPasswordChangedConfirmationEmail({ to, name }) {
  const recipientName = name ? name.split(' ')[0] : 'Valued Customer';
  const fromAddress = process.env.SMTP_FROM || '"Kola Express Security" <security@kolaexpress.ug>';
  const subject = '🔐 Your Kola Express Password Has Been Changed';

  const plainText = `
Hello ${recipientName},

This is a security confirmation that your password for your Kola Express account (${to}) was successfully updated.

If you made this change, no further action is required.
If you did NOT make this change, please contact Kola Express Security immediately at support@kolaexpress.ug.

Sincerely,
The Kola Express Security Team
  `.trim();

  const transporter = getTransporter();
  let messageId = null;
  let previewUrl = null;

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text: plainText
    });
    messageId = info.messageId;
    previewUrl = nodemailer.getTestMessageUrl(info) || null;
    console.log(`[Security Alert] Password changed confirmation dispatched to ${to} (MessageId: ${messageId})`);
    if (previewUrl) {
      console.log(`📬 [Real Inbox Preview URL]: ${previewUrl}`);
    }
  } catch (err) {
    console.warn('[Email Confirmation Warning]:', err.message);
  }

  return { success: true, mode: 'smtp', messageId, previewUrl };
}

function getRecentEmails() {
  return [...recentEmails];
}

function clearRecentEmails() {
  recentEmails.length = 0;
}

module.exports = {
  getTransporter,
  sendEmailVerificationCode,
  sendPasswordRecoveryEmail,
  sendPasswordChangedConfirmationEmail,
  maskEmail,
  getRecentEmails,
  clearRecentEmails
};
