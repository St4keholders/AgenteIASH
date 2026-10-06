import http from "http";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en .env");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ],
});

console.log("==================================================================");
console.log("Autorización de Google Calendar OAuth 2.0 para Stakeholders");
console.log("Abre la siguiente URL en tu navegador si no se abre automáticamente:");
console.log(authUrl);
console.log("==================================================================");

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith("/oauth2callback")) {
    res.writeHead(404);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const code = urlObj.searchParams.get("code");

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>Error: No se recibió código de autorización.</h1>");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>No se recibió un refresh token nuevo (la cuenta ya fue autorizada). Para forzarlo, revoca el acceso en tu cuenta de Google y repite.</h1>");
      server.close();
      return;
    }

    // Guardar directamente en .env sin imprimirlo en terminal
    const envPath = path.resolve(process.cwd(), ".env");
    let envContent = fs.readFileSync(envPath, "utf8");

    if (envContent.includes("GOOGLE_REFRESH_TOKEN=")) {
      envContent = envContent.replace(
        /GOOGLE_REFRESH_TOKEN=.*/,
        `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`
      );
    } else {
      envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    }

    fs.writeFileSync(envPath, envContent, "utf8");

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>¡Autorización exitosa! El refresh token ha sido guardado en .env. Ya puedes cerrar esta ventana.</h1>");
    console.log("✅ Refresh token guardado en .env exitosamente (sin mostrar en terminal).");
    server.close();
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>Error al obtener los tokens de Google.</h1>");
    console.error("Error en intercambio de código OAuth.");
    server.close();
  }
});

server.listen(PORT, () => {
  console.log(`Servidor local esperando redirección en ${REDIRECT_URI}...`);
});
