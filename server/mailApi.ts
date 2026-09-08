import { createHash, randomUUID } from "node:crypto";
import { Router, json, type ErrorRequestHandler, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import nodemailer from "nodemailer";
import { AccessDenied, AuthenticationUnavailable } from "./authAuthority";

export const MAIL_ROLES = ["System Administrator", "Directory Data Steward"] as const;
export const DIAGNOSTIC_TEMPLATE = "tmpl-diagnostic-test";

export interface MailIdentity {
  uid: string;
  role?: unknown;
  name?: unknown;
}

export { AuthenticationUnavailable as MailAuthenticationUnavailable } from "./authAuthority";

export interface MailConfiguration {
  host: string;
  port: 465 | 587;
  user: string;
  password: string;
  from: string;
  recipients: string[];
  fromName?: string;
  replyTo?: string;
  steward?: string;
}

export interface MailSettings {
  smtpHost: string;
  smtpPort: 465 | 587;
  smtpUser: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  stewardAlertRecipient: string;
  diagnosticRecipients: string[];
}

export interface MailSettingsStore {
  read(): Promise<MailSettings | null>;
  write(settings: MailSettings, identity: MailIdentity): Promise<void>;
}

export interface MailMessage {
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  disableFileAccess: true;
  disableUrlAccess: true;
}
export type MailEvent = "user-invitation" | "request-submitted" | "request-approved" | "request-rejected";
export type ResolveMailEvent = (event: MailEvent, entityId: string, identity: MailIdentity, configuration: MailConfiguration) => Promise<Omit<MailMessage, "from" | "replyTo" | "disableFileAccess" | "disableUrlAccess">>;
export type ResolveDiagnosticTemplate = (configuration: MailConfiguration) => Promise<Pick<MailMessage, "subject" | "text" | "html">>;

export interface MailApiOptions {
  authenticate: ((token: string) => Promise<MailIdentity>) | null;
  configuration: MailConfiguration | null;
  send: ((message: MailMessage, configuration?: MailConfiguration) => Promise<boolean>) | null;
  settings?: MailSettingsStore;
  resolveEvent?: ResolveMailEvent;
  resolveDiagnostic?: ResolveDiagnosticTemplate;
  audit?: (event: Record<string, string>) => void;
}

function mailbox(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254
    && !value.includes("*")
    && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(value);
}

export function loadMailConfiguration(environment: NodeJS.ProcessEnv = process.env): MailConfiguration | null {
  const { SMTP_HOST: host, SMTP_PORT: port, SMTP_USER: user, SMTP_PASSWORD: password, SMTP_FROM_EMAIL: from } = environment;
  const recipients = (environment.SMTP_ALLOWED_RECIPIENTS || "").split(",").map((recipient) => recipient.trim().toLowerCase());
  if (!host || !/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host)
    || (port !== "465" && port !== "587") || !user || /[\r\n]/.test(user) || !password
    || !mailbox(from) || !recipients.length || !recipients.every(mailbox)) return null;
  const fromName = safeHeader(environment.SMTP_FROM_NAME || "");
  const replyTo = mailbox(environment.SMTP_REPLY_TO) ? environment.SMTP_REPLY_TO.toLowerCase() : undefined;
  const steward = mailbox(environment.DIRECTORY_STEWARD_EMAIL) ? environment.DIRECTORY_STEWARD_EMAIL.toLowerCase() : undefined;
  return { host, port: Number(port) as 465 | 587, user, password, from, recipients, ...(fromName ? { fromName } : {}), ...(replyTo ? { replyTo } : {}), ...(steward ? { steward } : {}) };
}

export function parseMailSettings(value: unknown): MailSettings | null {
  if (!plainObject(value) || Object.keys(value).some(field => !["smtpHost", "smtpPort", "smtpUser", "fromName", "fromEmail", "replyToEmail", "stewardAlertRecipient", "diagnosticRecipients"].includes(field))) return null;
  const smtpHost = typeof value.smtpHost === "string" ? value.smtpHost.trim().toLowerCase() : "";
  const smtpPort = Number(value.smtpPort);
  const smtpUser = safeHeader(value.smtpUser);
  const fromName = safeHeader(value.fromName);
  const fromEmail = typeof value.fromEmail === "string" ? value.fromEmail.trim().toLowerCase() : "";
  const replyToEmail = typeof value.replyToEmail === "string" ? value.replyToEmail.trim().toLowerCase() : "";
  const stewardAlertRecipient = typeof value.stewardAlertRecipient === "string" ? value.stewardAlertRecipient.trim().toLowerCase() : "";
  const diagnosticRecipients = Array.isArray(value.diagnosticRecipients)
    ? [...new Set(value.diagnosticRecipients.map(recipient => typeof recipient === "string" ? recipient.trim().toLowerCase() : ""))]
    : [];
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(smtpHost) || ![465, 587].includes(smtpPort)
    || !smtpUser || smtpUser.length > 254 || !fromName || fromName.length > 100 || !mailbox(fromEmail)
    || (replyToEmail && !mailbox(replyToEmail)) || !mailbox(stewardAlertRecipient)
    || !diagnosticRecipients.length || diagnosticRecipients.length > 20 || !diagnosticRecipients.every(mailbox)) return null;
  return { smtpHost, smtpPort: smtpPort as 465 | 587, smtpUser, fromName, fromEmail, replyToEmail, stewardAlertRecipient, diagnosticRecipients };
}

export function smtpTransportOptions(configuration: MailConfiguration) {
  return {
    host: configuration.host,
    port: configuration.port,
    secure: configuration.port === 465,
    requireTLS: true,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" as const },
    auth: { user: configuration.user, pass: configuration.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  };
}

export function createMailSender(configuration: MailConfiguration): MailApiOptions["send"] {
  const transport = nodemailer.createTransport(smtpTransportOptions(configuration));
  return async (message) => {
    const result = await transport.sendMail(message);
    return result.accepted.some((recipient) => String(recipient).toLowerCase() === message.to.toLowerCase());
  };
}

export function createMailRouter(options: MailApiOptions): Router {
  const router = Router();
  const audit = options.audit ?? ((event) => console.info(JSON.stringify(event)));
  router.use((_request, response, next) => {
    response.locals.requestId = randomUUID();
    response.setHeader("X-Request-ID", response.locals.requestId);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.on("finish", () => audit({
      event: "mail_request",
      requestId: response.locals.requestId,
      actor: response.locals.mailIdentity
        ? createHash("sha256").update(response.locals.mailIdentity.uid).digest("hex") : "unauthenticated",
      outcome: response.locals.mailOutcome || String(response.statusCode),
    }));
    next();
  });
  const limiter = (limit: number, windowMs: number, keyGenerator?: () => string) => rateLimit({
    limit, windowMs, keyGenerator, standardHeaders: "draft-8", legacyHeaders: false,
    handler: (_request, response) => mailError(response, 429, "mail_rate_limited", "Mail request limit exceeded."),
  });
  router.use(limiter(20, 60_000));
  router.use(limiter(60, 60_000, () => "mail-global"));
  router.use(async (request, response, next) => {
    if (!options.authenticate) return mailError(response, 503, "mail_auth_unavailable", "Mail authentication is unavailable.");
    const token = request.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token || token.length > 8192) return mailError(response, 401, "invalid_token", "A valid Firebase ID token is required.");
    let identity: MailIdentity;
    try {
      identity = await options.authenticate(token);
    } catch (error) {
      if (error instanceof AccessDenied) return mailError(response, 403, "mail_role_required", "An authorized directory administrator role is required.");
      return error instanceof AuthenticationUnavailable
        ? mailError(response, 503, "mail_auth_unavailable", "Mail authentication is unavailable.")
        : mailError(response, 401, "invalid_token", "A valid Firebase ID token is required.");
    }
    if (!identity.uid) return mailError(response, 403, "mail_role_required", "An authorized directory account is required.");
    response.locals.mailIdentity = identity;
    next();
  });
  router.get("/status", async (_request, response) => {
    if (!hasMailRole(response.locals.mailIdentity)) return mailError(response, 403, "mail_role_required", "An authorized directory administrator role is required.");
    try { response.json({ configured: Boolean(await activeConfiguration(options) && options.send) }); }
    catch { mailError(response, 503, "mail_configuration_unavailable", "Mail configuration is unavailable."); }
  });
  router.get("/settings", async (_request, response) => {
    if (!hasMailRole(response.locals.mailIdentity)) return mailError(response, 403, "mail_role_required", "An authorized directory administrator role is required.");
    try {
      const saved = await options.settings?.read();
      const settings = saved || (options.configuration ? settingsFromConfiguration(options.configuration) : null);
      if (!settings) return mailError(response, 503, "mail_not_configured", "Mail delivery is not configured.");
      response.json({ settings, passwordConfigured: Boolean(options.configuration?.password) });
    } catch { mailError(response, 503, "mail_configuration_unavailable", "Mail configuration is unavailable."); }
  });
  router.put("/settings", json({ limit: "4kb", strict: true, inflate: false }), async (request, response) => {
    const identity = response.locals.mailIdentity as MailIdentity;
    if (identity.role !== "System Administrator") return mailError(response, 403, "mail_role_required", "System Administrator access is required.");
    const settings = parseMailSettings(request.body);
    if (!settings) return mailError(response, 400, "invalid_mail_settings", "The mail settings are invalid.");
    if (!options.settings) return mailError(response, 503, "mail_configuration_unavailable", "Mail configuration storage is unavailable.");
    try {
      await options.settings.write(settings, identity);
      response.json({ settings, passwordConfigured: Boolean(options.configuration?.password) });
    } catch { mailError(response, 503, "mail_configuration_unavailable", "Mail configuration could not be saved."); }
  });
  router.post("/dispatch",
    limiter(10, 10 * 60_000, () => "mail-dispatch-global"),
    rateLimit({
      limit: 3, windowMs: 10 * 60_000, standardHeaders: "draft-8", legacyHeaders: false,
      keyGenerator: (_request, response) => response.locals.mailIdentity.uid,
      handler: (_request, response) => mailError(response, 429, "mail_rate_limited", "Mail request limit exceeded."),
    }),
    (request, response, next) => {
      if (!request.is("application/json")) return mailError(response, 415, "invalid_content_type", "An application/json body is required.");
      next();
    },
    json({ limit: "2kb", strict: true, inflate: false }),
    async (request, response) => {
      if (!hasMailRole(response.locals.mailIdentity)) return mailError(response, 403, "mail_role_required", "An authorized directory administrator role is required.");
      const body = request.body;
      if (!body || typeof body !== "object" || Array.isArray(body)
        || Object.keys(body).some((field) => field !== "recipient" && field !== "templateId")
        || !mailbox(body.recipient) || body.templateId !== DIAGNOSTIC_TEMPLATE) {
        return mailError(response, 400, "invalid_mail_request", "Only an approved recipient and templateId are accepted.");
      }
      let configuration: MailConfiguration | null;
      try { configuration = await activeConfiguration(options); }
      catch { return mailError(response, 503, "mail_configuration_unavailable", "Mail configuration is unavailable."); }
      if (!configuration || !options.send) return mailError(response, 503, "mail_not_configured", "Mail delivery is not configured.");
      const recipient = body.recipient.toLowerCase();
      if (!configuration.recipients.includes(recipient)) {
        return mailError(response, 403, "recipient_not_allowed", "The recipient is not approved for mail delivery.");
      }
      try {
        const content = options.resolveDiagnostic
          ? await options.resolveDiagnostic(configuration)
          : {
              subject: "Shiekh Directory SMTP Relay Verification",
              text: "This diagnostic message confirms that the Shiekh Directory mail relay accepted a message requested by an authorized administrator.",
            };
        const accepted = await options.send({
          from: formattedSender(configuration), ...(configuration.replyTo ? { replyTo: configuration.replyTo } : {}), to: recipient,
          ...content,
          disableFileAccess: true, disableUrlAccess: true,
        }, configuration);
        if (!accepted) throw new Error("Not accepted");
        response.locals.mailOutcome = "accepted";
        response.json({ success: true, status: "accepted", requestId: response.locals.requestId, templateId: DIAGNOSTIC_TEMPLATE, subject: content.subject });
      } catch {
        mailError(response, 502, "mail_delivery_failed", "The mail relay could not accept the message.");
      }
    },
  );
  router.post("/event",
    limiter(20, 10 * 60_000, () => "mail-event-global"),
    json({ limit: "2kb", strict: true, inflate: false }),
    async (request, response) => {
      const body = request.body;
      const events: MailEvent[] = ["user-invitation", "request-submitted", "request-approved", "request-rejected"];
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(field => field !== "event" && field !== "entityId")
        || !events.includes(body.event) || typeof body.entityId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(body.entityId)) {
        return mailError(response, 400, "invalid_mail_event", "A supported mail event and entityId are required.");
      }
      const identity = response.locals.mailIdentity as MailIdentity;
      if (body.event === "user-invitation" && identity.role !== "System Administrator") return mailError(response, 403, "mail_role_required", "System Administrator access is required.");
      if (body.event !== "request-submitted" && body.event !== "user-invitation" && !hasMailRole(identity)) return mailError(response, 403, "mail_role_required", "An authorized directory administrator role is required.");
      let configuration: MailConfiguration | null;
      try { configuration = await activeConfiguration(options); }
      catch { return mailError(response, 503, "mail_configuration_unavailable", "Mail configuration is unavailable."); }
      if (!configuration || !options.send || !options.resolveEvent) return mailError(response, 503, "mail_not_configured", "Mail delivery is not configured.");
      try {
        const resolved = await options.resolveEvent(body.event, body.entityId, identity, configuration);
        if (!mailbox(resolved.to)) throw new Error("Invalid resolved recipient");
        const accepted = await options.send({ ...resolved, from: formattedSender(configuration), ...(configuration.replyTo ? { replyTo: configuration.replyTo } : {}), disableFileAccess: true, disableUrlAccess: true }, configuration);
        if (!accepted) throw new Error("Not accepted");
        response.locals.mailOutcome = "accepted";
        response.json({ success: true, status: "accepted", requestId: response.locals.requestId });
      } catch (error) {
        if (error instanceof AccessDenied) return mailError(response, 403, "mail_event_not_allowed", "The requested mail event is not allowed.");
        mailError(response, 502, "mail_delivery_failed", "The mail relay could not accept the message.");
      }
    },
  );
  router.use((_request, response) => mailError(response, 404, "api_route_not_found", "API route not found."));
  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const status = error?.status === 413 ? 413 : error?.status === 415 ? 415 : 400;
    mailError(response, status, "invalid_mail_body", "The mail request body is invalid or exceeds 2 KB.");
  };
  router.use(errorHandler);
  return router;
}

function hasMailRole(identity: MailIdentity | undefined) {
  return Boolean(identity && MAIL_ROLES.some(role => role === identity.role));
}

async function activeConfiguration(options: MailApiOptions): Promise<MailConfiguration | null> {
  if (!options.configuration) return null;
  const settings = await options.settings?.read();
  if (!settings) return options.configuration;
  return {
    host: settings.smtpHost,
    port: settings.smtpPort,
    user: settings.smtpUser,
    password: options.configuration.password,
    from: settings.fromEmail,
    recipients: settings.diagnosticRecipients,
    fromName: settings.fromName,
    ...(settings.replyToEmail ? { replyTo: settings.replyToEmail } : {}),
    steward: settings.stewardAlertRecipient,
  };
}

function settingsFromConfiguration(configuration: MailConfiguration): MailSettings {
  return {
    smtpHost: configuration.host,
    smtpPort: configuration.port,
    smtpUser: configuration.user,
    fromName: configuration.fromName || "Shiekh Directory",
    fromEmail: configuration.from,
    replyToEmail: configuration.replyTo || "",
    stewardAlertRecipient: configuration.steward || configuration.from,
    diagnosticRecipients: configuration.recipients,
  };
}

function formattedSender(configuration: MailConfiguration) {
  return configuration.fromName ? `${configuration.fromName} <${configuration.from}>` : configuration.from;
}

function safeHeader(value: unknown) {
  return typeof value === "string" && !/[\r\n]/.test(value) ? value.trim() : "";
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function mailError(response: Response, status: number, code: string, message: string) {
  response.locals.mailOutcome = code;
  return response.status(status).json({ error: { code, message, requestId: response.locals.requestId } });
}