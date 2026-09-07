import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";

// Attempt to load .env file if present in Node 20.6+
try {
  (process as any).loadEnvFile?.();
} catch {
  // Ignored if .env file does not exist
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // SMTP Server Status Endpoint - safely exposes whether server-side credentials exist
  app.get("/api/mail/status", (req, res) => {
    res.json({
      hasServerPassword: Boolean(process.env.SMTP_PASSWORD),
      serverHost: process.env.SMTP_HOST || null,
      serverPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
      serverUser: process.env.SMTP_USER || null
    });
  });

  // SMTP Dispatch Endpoint for Real Mail Relay
  app.post("/api/mail/dispatch", async (req, res) => {
    try {
      const {
        recipient,
        subject,
        templateId,
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPassword,
        fromEmail,
        fromName,
        enforceTls,
        smtpConfig
      } = req.body;

      // Extract settings from root payload or nested smtpConfig object
      const host = smtpHost || smtpConfig?.smtpHost || process.env.SMTP_HOST || "smtp.gmail.com";
      const port = Number(smtpPort || smtpConfig?.smtpPort || process.env.SMTP_PORT || 587);
      const user = smtpUser || smtpConfig?.smtpUser || process.env.SMTP_USER || "";
      const rawPass = smtpPassword || smtpConfig?.smtpPassword || process.env.SMTP_PASSWORD || "";
      // Strip spaces: Google App Passwords often copied in chunks of 4 characters: "abcd efgh ijkl mnop"
      const pass = rawPass ? rawPass.replace(/\s+/g, "") : "";
      const fromAddr = fromEmail || smtpConfig?.fromEmail || user || "noreply@shiekhshoes.org";
      const senderName = fromName || smtpConfig?.fromName || "Shiekh Directory";
      const shouldEnforceTls = enforceTls !== undefined ? Boolean(enforceTls) : true;

      if (!recipient || typeof recipient !== "string" || !recipient.includes("@")) {
        return res.status(400).json({ error: "A valid recipient email address is required." });
      }

      if (!host) {
        return res.status(400).json({ error: "SMTP host is required." });
      }

      if (user && !pass) {
        return res.status(400).json({
          error: "SMTP password missing. Please configure the SMTP_PASSWORD environment variable or enter password in session."
        });
      }

      // Check if secure (port 465 uses direct SSL/TLS; 587/25 uses STARTTLS)
      const isSecure = port === 465;

      const transportOptions: any = {
        host,
        port,
        secure: isSecure,
        tls: {
          rejectUnauthorized: shouldEnforceTls
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000
      };

      if (user && pass) {
        transportOptions.auth = {
          user,
          pass
        };
      }

      const transporter = nodemailer.createTransport(transportOptions);

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
          <div style="border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="margin: 0; color: #111827; font-size: 20px; font-weight: 700;">Shiekh Directory — SMTP Gateway Verification</h2>
            <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 13px;">Live Diagnostic Test Transmission</p>
          </div>
          <p style="color: #374151; font-size: 15px; line-height: 1.5; margin-bottom: 16px;">
            This email confirms that your SMTP relay configuration is <strong>fully operational and transmitting successfully</strong>.
          </p>
          <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px 16px; margin-bottom: 20px;">
            <table style="width: 100%; font-size: 13px; color: #4b5563; border-collapse: collapse;">
              <tr>
                <td style="padding: 4px 0; font-weight: 600; width: 120px;">SMTP Host:</td>
                <td style="padding: 4px 0; font-family: monospace;">${host}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: 600;">Port / Security:</td>
                <td style="padding: 4px 0; font-family: monospace;">${port} (${isSecure ? 'SSL/TLS' : 'STARTTLS'})</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: 600;">From Address:</td>
                <td style="padding: 4px 0;">${fromAddr}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: 600;">Recipient:</td>
                <td style="padding: 4px 0;">${recipient}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: 600;">Dispatched At:</td>
                <td style="padding: 4px 0;">${new Date().toUTCString()}</td>
              </tr>
            </table>
          </div>
          <p style="color: #9ca3af; font-size: 12px; margin: 0; border-top: 1px solid #f3f4f6; padding-top: 12px;">
            Dynamic QR Code Manager & Directory Service
          </p>
        </div>
      `;

      const mailOptions = {
        from: senderName ? `"${senderName}" <${fromAddr}>` : fromAddr,
        to: recipient,
        subject: subject || "[Diagnostic Ping] Shiekh Directory SMTP Relay Verification",
        text: `Diagnostic SMTP Ping\n\nRecipient: ${recipient}\nTimestamp: ${new Date().toISOString()}\nRelay: ${host}:${port}`,
        html: htmlBody
      };

      const info = await transporter.sendMail(mailOptions);

      return res.status(200).json({
        success: true,
        messageId: info.messageId,
        response: info.response
      });
    } catch (err: any) {
      const errorMsg = err?.message || "Failed to dispatch email via SMTP relay";
      console.error("[SMTP Relay Error]:", errorMsg);
      return res.status(500).json({
        success: false,
        error: errorMsg
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
