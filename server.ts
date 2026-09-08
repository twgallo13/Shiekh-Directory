import express from "express";
import { createServer as createHttpServer } from "node:http";
import path from "path";
import {
  apiErrorHandler,
  apiNotFoundHandler,
  createDirectoryApiRouter,
  loadApiCredentials,
} from "./server/directoryApi";
import { createFirestoreLocationRepository } from "./server/firestoreLocations";
import { createMailRouter, createMailSender, loadMailConfiguration } from "./server/mailApi";
import { createFirestoreDiagnosticResolver, createFirestoreInvitationEmailResolver, createFirestoreInvitationLinkResolver, createFirestoreMailEventResolver, createFirestoreMailOutcomeRecorder, createFirestoreMailSettingsStore } from "./server/firestoreMail";
import { createAuthRouter, createFirebaseAuthenticator } from "./server/authAuthority";
import { createFirestoreDirectoryStore } from "./server/firestoreDirectory";
import { createDirectoryDataRouter } from "./server/directoryDataApi";

// Attempt to load .env file if present in Node 20.6+
try {
  (process as any).loadEnvFile?.();
} catch {
  // Ignored if .env file does not exist
}

async function startServer() {
  const app = express();
  if (process.env.K_SERVICE) app.set("trust proxy", 1);
  const httpServer = createHttpServer(app);
  const PORT = Number(process.env.PORT || 3000);

  const mailConfiguration = loadMailConfiguration();
  const mailSettings = createFirestoreMailSettingsStore();
  const authenticate = createFirebaseAuthenticator();
  const directory = createFirestoreDirectoryStore();
  app.use("/api/auth", createAuthRouter(authenticate, () => directory.read()));
  app.use("/api/mail", createMailRouter({
    authenticate,
    configuration: mailConfiguration,
    send: mailConfiguration ? (message, configuration = mailConfiguration) => createMailSender(configuration)!(message) : null,
    settings: mailSettings,
    resolveEvent: createFirestoreMailEventResolver(),
    resolveDiagnostic: createFirestoreDiagnosticResolver(),
    resolveInvitationLink: createFirestoreInvitationLinkResolver(),
    resolveInvitationEmail: createFirestoreInvitationEmailResolver(),
    recordMailOutcome: createFirestoreMailOutcomeRecorder(),
  }));
  app.use(express.json());
  app.use("/api/directory", createDirectoryDataRouter(authenticate, directory));

  app.use("/api/v1", createDirectoryApiRouter({
    credentials: loadApiCredentials(),
    tokenHmacSecret: process.env.DIRECTORY_API_TOKEN_HMAC_SECRET || "",
    locations: createFirestoreLocationRepository(),
  }));

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", apiNotFoundHandler);
  app.use("/api", apiErrorHandler);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/src/data/initialData.ts', '**/server.ts', '**/server/**', path.join(process.cwd(), 'dist', '**'), '**/reference-data/**', '**/docs/**', '**/test/**', '**/API.md'] },
        hmr: { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use('/assets', express.static(path.join(distPath, 'assets')));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
