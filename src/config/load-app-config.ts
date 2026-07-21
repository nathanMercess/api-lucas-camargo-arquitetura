import { AuthMode } from '../auth/auth-mode.enum.js';
import { StorageDriver } from '../storage/storage-driver.enum.js';
import { AppConfig } from './app-config.model.js';
import { AppEnvironment } from './app-environment.type.js';
import { R2Config } from './r2-config.model.js';

const defaultOwnerEmail = 'nathan66merces@gmail.com';

export function loadAppConfig(environmentVariables: NodeJS.ProcessEnv = process.env): AppConfig {
  const environment = readEnvironment(environmentVariables['NODE_ENV']);
  const authMode = readAuthMode(environmentVariables['AUTH_MODE'], environment);
  const storageDriver = readStorageDriver(environmentVariables['STORAGE_DRIVER'], environment);
  const initialOwnerEmail = readEmail(environmentVariables['INITIAL_OWNER_EMAIL'] ?? defaultOwnerEmail, 'INITIAL_OWNER_EMAIL');
  const developmentPrincipalEmail = readEmail(
    environmentVariables['DEVELOPMENT_PRINCIPAL_EMAIL'] ?? initialOwnerEmail,
    'DEVELOPMENT_PRINCIPAL_EMAIL',
  );
  const iapExpectedAudience = readOptionalValue(environmentVariables['IAP_EXPECTED_AUDIENCE']);
  const adminAllowedOrigins = readAllowedOrigins(environmentVariables['ADMIN_ALLOWED_ORIGINS'], environment);

  if (environment === 'production' && authMode !== AuthMode.Iap)
    throw new Error('AUTH_MODE must be iap in production.');

  if (authMode === AuthMode.Iap && iapExpectedAudience === undefined)
    throw new Error('IAP_EXPECTED_AUDIENCE is required when AUTH_MODE is iap.');

  const r2 = storageDriver === StorageDriver.R2
    ? readR2Config(environmentVariables, environment)
    : undefined;
  const publishedBaseUrl = r2?.publishedBaseUrl;

  return {
    environment,
    host: readOptionalValue(environmentVariables['HOST']) ?? '0.0.0.0',
    port: readPort(environmentVariables['PORT']),
    authMode,
    ...(iapExpectedAudience === undefined ? {} : { iapExpectedAudience }),
    initialOwnerEmail,
    developmentPrincipalEmail,
    storageDriver,
    ...(r2 === undefined ? {} : { r2 }),
    adminAllowedOrigins,
    ...(publishedBaseUrl === undefined ? {} : { publishedBaseUrl }),
  };
}

function readEnvironment(value: string | undefined): AppEnvironment {
  const normalizedValue = value?.trim().toLowerCase() ?? 'development';

  if (normalizedValue === 'development' || normalizedValue === 'test' || normalizedValue === 'production')
    return normalizedValue;

  throw new Error('NODE_ENV must be development, test or production.');
}

function readAuthMode(value: string | undefined, environment: AppEnvironment): AuthMode {
  const fallback = environment === 'production' ? AuthMode.Iap : AuthMode.Development;
  const normalizedValue = value?.trim().toLowerCase() ?? fallback;

  if (normalizedValue === AuthMode.Development || normalizedValue === AuthMode.Iap)
    return normalizedValue;

  throw new Error('AUTH_MODE must be development or iap.');
}

function readStorageDriver(value: string | undefined, environment: AppEnvironment): StorageDriver {
  const fallback = environment === 'production' ? StorageDriver.R2 : StorageDriver.Memory;
  const normalizedValue = value?.trim().toLowerCase() ?? fallback;

  if (normalizedValue === StorageDriver.Memory || normalizedValue === StorageDriver.R2)
    return normalizedValue;

  throw new Error('STORAGE_DRIVER must be memory or r2.');
}

function readPort(value: string | undefined): number {
  const parsedValue = Number.parseInt(value ?? '8080', 10);

  if (Number.isInteger(parsedValue) && parsedValue >= 1 && parsedValue <= 65_535)
    return parsedValue;

  throw new Error('PORT must be an integer between 1 and 65535.');
}

function readEmail(value: string, variableName: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedValue))
    return normalizedValue;

  throw new Error(`${variableName} must contain a valid email address.`);
}

function readR2Config(
  environmentVariables: NodeJS.ProcessEnv,
  environment: AppEnvironment,
): R2Config {
  const publishedBaseUrl = readPublishedBaseUrl(
    environmentVariables['R2_PUBLISHED_BASE_URL'],
    environment,
  );

  return {
    endpoint: readR2Endpoint(
      readRequiredValue(environmentVariables['R2_ENDPOINT'], 'R2_ENDPOINT'),
      environment,
    ),
    privateBucket: readRequiredValue(environmentVariables['R2_PRIVATE_BUCKET'], 'R2_PRIVATE_BUCKET'),
    publishedBucket: readRequiredValue(environmentVariables['R2_PUBLISHED_BUCKET'], 'R2_PUBLISHED_BUCKET'),
    ...(publishedBaseUrl === undefined ? {} : { publishedBaseUrl }),
    accessKeyId: readRequiredValue(environmentVariables['R2_ACCESS_KEY_ID'], 'R2_ACCESS_KEY_ID'),
    secretAccessKey: readRequiredValue(environmentVariables['R2_SECRET_ACCESS_KEY'], 'R2_SECRET_ACCESS_KEY'),
  };
}

function readAllowedOrigins(value: string | undefined, environment: AppEnvironment): readonly string[] {
  const fallback = environment === 'production' ? undefined : 'http://localhost:4201';
  const entries = (readOptionalValue(value) ?? fallback)?.split(',').map((entry) => entry.trim()).filter(Boolean);

  if (entries === undefined || entries.length === 0)
    throw new Error('ADMIN_ALLOWED_ORIGINS is required in production.');

  return [...new Set(entries.map((entry) => readOrigin(entry, environment)))];
}

function readOrigin(value: string, environment: AppEnvironment): string {
  const parsedUrl = new URL(value);

  if (parsedUrl.origin !== value || parsedUrl.username !== '' || parsedUrl.password !== '')
    throw new Error('ADMIN_ALLOWED_ORIGINS must contain exact URL origins without paths.');

  if (environment === 'production' && parsedUrl.protocol !== 'https:')
    throw new Error('ADMIN_ALLOWED_ORIGINS must use HTTPS in production.');

  return parsedUrl.origin;
}

function readR2Endpoint(value: string, environment: AppEnvironment): string {
  const parsedUrl = new URL(value);

  if (
    parsedUrl.username !== '' ||
    parsedUrl.password !== '' ||
    parsedUrl.search !== '' ||
    parsedUrl.hash !== '' ||
    parsedUrl.pathname !== '/'
  )
    throw new Error('R2_ENDPOINT must not contain credentials, a path, a query or a fragment.');

  if (environment !== 'production' && ['http:', 'https:'].includes(parsedUrl.protocol))
    return parsedUrl.origin;

  const isCloudflareR2Host = /^[a-f0-9]{32}\.(?:(?:eu|fedramp)\.)?r2\.cloudflarestorage\.com$/i
    .test(parsedUrl.hostname);

  if (parsedUrl.protocol === 'https:' && parsedUrl.port === '' && isCloudflareR2Host)
    return parsedUrl.origin;

  throw new Error('R2_ENDPOINT must use the official HTTPS Cloudflare R2 S3 endpoint in production.');
}

function readPublishedBaseUrl(
  value: string | undefined,
  environment: AppEnvironment,
): string | undefined {
  const normalizedValue = readOptionalValue(value);

  if (normalizedValue === undefined)
    return undefined;

  const parsedUrl = new URL(normalizedValue);
  const validProtocol = environment === 'production'
    ? parsedUrl.protocol === 'https:'
    : ['http:', 'https:'].includes(parsedUrl.protocol);

  if (
    validProtocol &&
    parsedUrl.username === '' &&
    parsedUrl.password === '' &&
    parsedUrl.search === '' &&
    parsedUrl.hash === '' &&
    parsedUrl.pathname === '/content'
  )
    return `${parsedUrl.origin}/content`;

  throw new Error('R2_PUBLISHED_BASE_URL must be an exact content base URL without credentials, query or fragment.');
}

function readRequiredValue(value: string | undefined, variableName: string): string {
  const normalizedValue = readOptionalValue(value);

  if (normalizedValue !== undefined)
    return normalizedValue;

  throw new Error(`${variableName} is required.`);
}

function readOptionalValue(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();

  return normalizedValue === '' ? undefined : normalizedValue;
}
