// Serveur Next local Botdeck avec support HTTP, HTTPS et redirection TLS.

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const next = require("next");

function argValue(name, fallback = null) {
	const exactIndex = process.argv.indexOf(name);
	if (exactIndex >= 0) {
		const value = process.argv[exactIndex + 1];
		if (value && !value.startsWith("--")) return value;
	}
	const prefix = `${name}=`;
	const inline = process.argv.find((arg) => arg.startsWith(prefix));
	return inline ? inline.slice(prefix.length) : fallback;
}

function parseBoolean(value) {
	return value === true || value === "1" || String(value).toLowerCase() === "true" || String(value).toLowerCase() === "yes";
}

function dataDir() {
	return process.env.BOTDECK_DATA_DIR || path.join(process.cwd(), ".botdeck");
}

function tlsConfigPath() {
	return path.join(dataDir(), "tls", "tls-config.json");
}

function readTlsConfig() {
	try {
		const payload = JSON.parse(fs.readFileSync(tlsConfigPath(), "utf8"));
		if (!payload || typeof payload !== "object") return null;
		if (!payload.enabled || !payload.certificatePath || !payload.keyPath) return null;
		if (!fs.existsSync(payload.certificatePath) || !fs.existsSync(payload.keyPath)) return null;
		return payload;
	} catch {
		return null;
	}
}

function localUrl(protocol, host, port) {
	return `${protocol}://${host}:${port}`;
}

function isPrivilegedPortForCurrentUser(port) {
	return process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() !== 0 && port < 1024;
}

async function startHttpFallback(handleApp, host, httpPort, reason) {
	console.warn(`[botdeck:tls] HTTPS désactivé temporairement: ${reason}`);
	console.warn(`[botdeck:tls] Ouvre l’interface en HTTP puis choisis un port supérieur à 1023, par exemple 3443.`);
	await startServer(http.createServer(handleApp), host, httpPort, "http");
	console.log(`[botdeck] ready ${localUrl("http", host, httpPort)} tls=fallback`);
}

function requestLocation(request, protocol, host, port) {
	return `${localUrl(protocol, host, port)}${request.url || "/"}`;
}

function startServer(server, host, port, label) {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, host, () => {
			server.off("error", reject);
			console.log(`[botdeck:${label}] listening on ${host}:${port}`);
			resolve();
		});
	});
}

async function main() {
	const dir = path.resolve(argValue("--dir", process.cwd()));
	const host = argValue("--host", process.env.HOST || "127.0.0.1");
	const httpPort = Number.parseInt(argValue("--port", process.env.PORT || "3000"), 10) || 3000;
	const dev = parseBoolean(argValue("--dev", process.env.NODE_ENV !== "production" ? "true" : "false"));
	const tls = readTlsConfig();
	if (tls) {
		process.env.BOTDECK_TLS_ENABLED = "1";
		process.env.BOTDECK_TLS_MODE = tls.mode || "https-only";
		process.env.BOTDECK_TLS_CERTIFICATE_PATH = tls.certificatePath;
		process.env.BOTDECK_TLS_KEY_PATH = tls.keyPath;
	}
	const httpsPort = Number.parseInt(String(tls?.httpsPort || process.env.BOTDECK_HTTPS_PORT || "3443"), 10) || 3443;
	const app = next({ dev, dir, hostname: host, port: httpPort });
	const handle = app.getRequestHandler();

	await app.prepare();

	const handleApp = (request, response) => {
		handle(request, response).catch((error) => {
			console.error("[botdeck:http:error]", error);
			if (!response.headersSent) response.statusCode = 500;
			response.end("Internal server error");
		});
	};

	if (!tls) {
		await startServer(http.createServer(handleApp), host, httpPort, "http");
		console.log(`[botdeck] ready ${localUrl("http", host, httpPort)}`);
		return;
	}

	if (isPrivilegedPortForCurrentUser(httpsPort)) {
		await startHttpFallback(handleApp, host, httpPort, `port ${httpsPort} refusé sans droits administrateur`);
		return;
	}

	const secureContext = {
		key: fs.readFileSync(tls.keyPath),
		cert: fs.readFileSync(tls.certificatePath)
	};
	try {
		await startServer(https.createServer(secureContext, handleApp), host, httpsPort, "https");
	} catch (error) {
		await startHttpFallback(handleApp, host, httpPort, error && error.message ? error.message : "démarrage HTTPS impossible");
		return;
	}

	const httpHandler = tls.mode === "dual"
		? handleApp
		: (request, response) => {
			response.writeHead(308, {
				Location: requestLocation(request, "https", host, httpsPort),
				"Cache-Control": "no-store, max-age=0"
			});
			response.end();
		};

	await startServer(http.createServer(httpHandler), host, httpPort, tls.mode === "dual" ? "http" : "http-redirect");
	console.log(`[botdeck] ready ${localUrl("https", host, httpsPort)} mode=${tls.mode || "https-only"}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
