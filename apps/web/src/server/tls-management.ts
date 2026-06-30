// Gestion TLS locale pour Botdeck.

import { spawn } from "node:child_process";
import { randomBytes, createHash, X509Certificate } from "node:crypto";
import { existsSync } from "node:fs";
import net from "node:net";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import tls from "node:tls";

export type BotdeckTlsMode = "dual" | "https-only";

export type BotdeckTlsConfig = {
	enabled: true;
	mode: BotdeckTlsMode;
	host: string;
	httpPort: number;
	httpsPort: number;
	certificatePath: string;
	keyPath: string;
	generated: boolean;
	fingerprint: string;
	updatedAt: string;
	validFrom?: string | null;
	validTo?: string | null;
};

const defaultHttpPort = 3000;
const defaultHttpsPort = 3443;
const restartExitCode = 42;

function parsePort(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

export function normalizeHttpsPort(value: unknown, fallback = tlsHttpsPort()): number {
	const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
	if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) return fallback;
	return parsed;
}

export function botdeckDataDir(): string {
	return process.env.BOTDECK_DATA_DIR || process.env.BOTDECK_PROJECT_DIR && path.join(process.env.BOTDECK_PROJECT_DIR, ".botdeck") || path.join(process.cwd(), ".botdeck");
}

export function tlsDirectory(): string {
	return path.join(botdeckDataDir(), "tls");
}

export function tlsConfigPath(): string {
	return path.join(tlsDirectory(), "tls-config.json");
}

export function tlsHttpPort(): number {
	return parsePort(process.env.PORT || process.env.BOTDECK_HTTP_PORT, defaultHttpPort);
}

export function tlsHttpsPort(): number {
	return parsePort(process.env.BOTDECK_HTTPS_PORT, defaultHttpsPort);
}

export function tlsListenHost(): string {
	return process.env.HOST || "127.0.0.1";
}

export function isPrivilegedHttpsPort(httpsPort: number): boolean {
	return process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() !== 0 && httpsPort < 1024;
}

export function assertHttpsPortAllowed(httpsPort: number): void {
	if (!Number.isFinite(httpsPort) || httpsPort < 1 || httpsPort > 65535) {
		throw new Error("Choisis un port HTTPS valide entre 1024 et 65535.");
	}
	if (isPrivilegedHttpsPort(httpsPort)) {
		throw new Error(`Le port ${httpsPort} est un port système. Botdeck est lancé sans droits administrateur, donc HTTPS ne peut pas écouter dessus. Utilise plutôt 3443, 4443 ou un port supérieur à 1023.`);
	}
	if (httpsPort === tlsHttpPort()) {
		throw new Error(`Le port ${httpsPort} est déjà utilisé par HTTP. Choisis un port HTTPS différent.`);
	}
}

export async function assertHttpsPortCanListen(httpsPort: number, host = tlsListenHost()): Promise<void> {
	assertHttpsPortAllowed(httpsPort);
	await new Promise<void>((resolve, reject) => {
		const server = net.createServer();
		server.once("error", (error: NodeJS.ErrnoException) => {
			const code = error.code || "UNKNOWN";
			if (code === "EACCES") {
				reject(new Error(`Le port ${httpsPort} est refusé par le système. Utilise 3443, 4443 ou lance Botdeck avec les droits nécessaires.`));
				return;
			}
			if (code === "EADDRINUSE") {
				reject(new Error(`Le port ${httpsPort} est déjà utilisé. Choisis un autre port HTTPS.`));
				return;
			}
			reject(new Error(`Le port ${httpsPort} ne peut pas être utilisé pour HTTPS (${code}).`));
		});
		server.listen(httpsPort, host, () => {
			server.close(() => resolve());
		});
	});
}

export async function readTlsConfig(): Promise<BotdeckTlsConfig | null> {
	try {
		const payload = JSON.parse(await readFile(tlsConfigPath(), "utf8")) as Partial<BotdeckTlsConfig>;
		if (!payload.enabled || !payload.certificatePath || !payload.keyPath) return null;
		if (!existsSync(payload.certificatePath) || !existsSync(payload.keyPath)) return null;
		return {
			enabled: true,
			mode: payload.mode === "dual" ? "dual" : "https-only",
			host: payload.host || "127.0.0.1",
			httpPort: payload.httpPort || tlsHttpPort(),
			httpsPort: payload.httpsPort || tlsHttpsPort(),
			certificatePath: payload.certificatePath,
			keyPath: payload.keyPath,
			generated: Boolean(payload.generated),
			fingerprint: payload.fingerprint || "",
			updatedAt: payload.updatedAt || new Date().toISOString(),
			validFrom: typeof payload.validFrom === "string" ? payload.validFrom : null,
			validTo: typeof payload.validTo === "string" ? payload.validTo : null
		};
	} catch {
		return null;
	}
}

export function requestHost(request: Request): string {
	const raw = request.headers.get("x-forwarded-host") || request.headers.get("host") || "127.0.0.1:3000";
	const withoutPort = raw.replace(/^\[/, "").replace(/\](:\d+)?$/, "");
	return withoutPort.includes(":") && !withoutPort.includes(".") ? "localhost" : withoutPort.split(":")[0] || "127.0.0.1";
}

export function tlsUrls(request: Request, config?: Partial<BotdeckTlsConfig> | null) {
	const host = config?.host || requestHost(request);
	const httpPort = config?.httpPort || tlsHttpPort();
	const httpsPort = config?.httpsPort || tlsHttpsPort();
	return {
		host,
		httpUrl: `http://${host}:${httpPort}`,
		httpsUrl: `https://${host}:${httpsPort}`,
		httpPort,
		httpsPort
	};
}

function fingerprintFor(certificate: string): string {
	return createHash("sha256").update(certificate).digest("hex").match(/.{1,2}/g)?.join(":") ?? "";
}

function certificateDates(certificate: string): { validFrom: string | null; validTo: string | null } {
	try {
		const parsed = new X509Certificate(certificate);
		return {
			validFrom: new Date(parsed.validFrom).toISOString(),
			validTo: new Date(parsed.validTo).toISOString()
		};
	} catch {
		return { validFrom: null, validTo: null };
	}
}

async function removeFileBestEffort(filePath: string | undefined | null): Promise<void> {
	if (!filePath) return;
	try {
		await unlink(filePath);
	} catch {
		// Le fichier peut déjà avoir été supprimé.
	}
}

export function validateTlsPair(certificate: string, key: string): void {
	try {
		tls.createSecureContext({ cert: certificate, key });
	} catch (error) {
		throw new Error(error instanceof Error ? error.message : "Certificat TLS invalide.");
	}
}

export async function saveTlsPair(options: { certificate: string; key: string; host: string; generated: boolean; mode?: BotdeckTlsMode; httpsPort?: number }): Promise<BotdeckTlsConfig> {
	const dir = tlsDirectory();
	await mkdir(dir, { recursive: true });
	validateTlsPair(options.certificate, options.key);
	const previous = await readTlsConfig();
	const dates = certificateDates(options.certificate);

	const suffix = randomBytes(5).toString("hex");
	const certificatePath = path.join(dir, `botdeck-${suffix}.crt`);
	const keyPath = path.join(dir, `botdeck-${suffix}.key`);
	await writeFile(certificatePath, options.certificate, { mode: 0o600 });
	await writeFile(keyPath, options.key, { mode: 0o600 });

	const config: BotdeckTlsConfig = {
		enabled: true,
		mode: options.mode ?? "https-only",
		host: options.host,
		httpPort: tlsHttpPort(),
		httpsPort: normalizeHttpsPort(options.httpsPort, tlsHttpsPort()),
		certificatePath,
		keyPath,
		generated: options.generated,
		fingerprint: fingerprintFor(options.certificate),
		updatedAt: new Date().toISOString(),
		validFrom: dates.validFrom,
		validTo: dates.validTo
	};
	await writeFile(tlsConfigPath(), JSON.stringify(config, null, 2), { mode: 0o600 });
	if (previous?.certificatePath !== certificatePath) void removeFileBestEffort(previous?.certificatePath);
	if (previous?.keyPath !== keyPath) void removeFileBestEffort(previous?.keyPath);
	return config;
}

export async function updateTlsMode(mode: BotdeckTlsMode, request: Request): Promise<BotdeckTlsConfig> {
	const current = await readTlsConfig();
	if (!current) throw new Error("Aucun certificat TLS n’est encore configuré.");
	const next = { ...current, mode, host: current.host || requestHost(request), updatedAt: new Date().toISOString() };
	await mkdir(tlsDirectory(), { recursive: true });
	await writeFile(tlsConfigPath(), JSON.stringify(next, null, 2), { mode: 0o600 });
	return next;
}

export async function updateTlsPort(httpsPort: number, request: Request): Promise<BotdeckTlsConfig> {
	const current = await readTlsConfig();
	if (!current) throw new Error("Aucun certificat TLS n’est encore configuré.");
	const next = {
		...current,
		host: current.host || requestHost(request),
		httpsPort: normalizeHttpsPort(httpsPort, current.httpsPort || tlsHttpsPort()),
		updatedAt: new Date().toISOString()
	};
	await mkdir(tlsDirectory(), { recursive: true });
	await writeFile(tlsConfigPath(), JSON.stringify(next, null, 2), { mode: 0o600 });
	return next;
}

function runOpenSsl(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn("openssl", args, { stdio: "ignore", shell: false });
		child.once("error", reject);
		child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`OpenSSL a quitté avec le code ${code ?? "inconnu"}.`)));
	});
}

export async function generateLocalCertificate(host: string): Promise<{ certificate: string; key: string }> {
	const dir = path.join(tmpdir(), `botdeck-tls-${randomBytes(6).toString("hex")}`);
	await mkdir(dir, { recursive: true });
	const certificatePath = path.join(dir, "botdeck-local.crt");
	const keyPath = path.join(dir, "botdeck-local.key");
	const san = ["DNS:localhost", "IP:127.0.0.1"];
	if (host && host !== "localhost" && host !== "127.0.0.1") san.push(`DNS:${host}`);
	await runOpenSsl([
		"req",
		"-x509",
		"-newkey",
		"rsa:2048",
		"-sha256",
		"-nodes",
		"-days",
		"825",
		"-keyout",
		keyPath,
		"-out",
		certificatePath,
		"-subj",
		"/CN=Botdeck Local",
		"-addext",
		`subjectAltName=${san.join(",")}`
	]);
	return {
		certificate: await readFile(certificatePath, "utf8"),
		key: await readFile(keyPath, "utf8")
	};
}

export function scheduleTlsRestart(): boolean {
	if (process.env.BOTDECK_ALLOW_SERVER_RESTART !== "1") return false;
	setTimeout(() => process.exit(restartExitCode), 650);
	return true;
}

export function restartPayload(request: Request, config: BotdeckTlsConfig) {
	const urls = tlsUrls(request, config);
	return {
		ok: true,
		configured: true,
		mode: config.mode,
		httpsUrl: urls.httpsUrl,
		httpUrl: urls.httpUrl,
		httpPort: urls.httpPort,
		httpsPort: urls.httpsPort,
		restartRequired: true,
		willRestart: scheduleTlsRestart(),
		fingerprint: config.fingerprint,
		validFrom: config.validFrom ?? null,
		validTo: config.validTo ?? null
	};
}
