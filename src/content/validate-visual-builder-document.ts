import { SiteDocument } from './site-document.model.js';
import { VisualBuilderProjectValue } from './visual-builder-project-value.type.js';

const maximumProjectBytes = 4_000_000;
const maximumProjectDepth = 32;
const maximumProjectNodes = 100_000;
const maximumArrayItems = 10_000;
const maximumObjectProperties = 512;
const maximumProjectStringLength = 500_000;
const prohibitedElementPattern = /<[\s/]*(?:base|embed|frame|frameset|iframe|link|meta|object|script|style)\b/i;
const eventHandlerAttributePattern = /[\s/]+on[a-z0-9:_-]*\s*=/i;
const dangerousCssPattern = /(?:@import\b|expression\s*\(|-moz-binding\s*:|behavior\s*:|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html)/i;
const prohibitedProjectKeyPattern = /^(?:script|scripts|script-export|script-props|srcdoc)$/i;
const eventHandlerKeyPattern = /^on[a-z0-9:_-]+$/i;
const mediaAttributeNames = new Set(['poster', 'src', 'srcset']);
const navigationAttributeNames = new Set(['action', 'formaction', 'href', 'xlink:href']);

interface ProjectValidationState {
  readonly canonicalOrigin: string;
  readonly errors: string[];
  readonly mediaPaths: ReadonlySet<string>;
  nodes: number;
}

export function validateVisualBuilderDocument(document: SiteDocument): readonly string[] {
  const visualBuilder = document.visualBuilder;

  if (visualBuilder === undefined)
    return [];

  const errors: string[] = [];
  const canonicalOrigin = readCanonicalOrigin(document.identity['canonicalUrl']);
  const mediaPaths = collectApprovedMediaPaths(document, canonicalOrigin, errors);

  validateHtml(visualBuilder.html, 'visualBuilder.html', canonicalOrigin, mediaPaths, errors);
  validateCss(visualBuilder.css, 'visualBuilder.css', canonicalOrigin, mediaPaths, errors);
  validateProjectSize(visualBuilder.projectData, errors);
  validateProjectValue(visualBuilder.projectData, 'visualBuilder.projectData', 0, {
    canonicalOrigin,
    errors,
    mediaPaths,
    nodes: 0,
  });

  return errors;
}

function validateProjectSize(
  projectData: Readonly<Record<string, VisualBuilderProjectValue>>,
  errors: string[],
): void {
  const sizeBytes = Buffer.byteLength(JSON.stringify(projectData), 'utf8');

  if (sizeBytes > maximumProjectBytes)
    errors.push(`visualBuilder.projectData must not exceed ${maximumProjectBytes} bytes.`);
}

function validateProjectValue(
  value: VisualBuilderProjectValue,
  path: string,
  depth: number,
  state: ProjectValidationState,
): void {
  state.nodes += 1;

  if (state.nodes > maximumProjectNodes) {
    if (state.nodes === maximumProjectNodes + 1)
      state.errors.push(`visualBuilder.projectData must not exceed ${maximumProjectNodes} values.`);

    return;
  }

  if (depth > maximumProjectDepth) {
    state.errors.push(`${path} exceeds the maximum nesting depth of ${maximumProjectDepth}.`);
    return;
  }

  if (typeof value === 'string') {
    validateProjectString(value, path, state);
    return;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    state.errors.push(`${path} must contain only finite numbers.`);
    return;
  }

  if (value === null || typeof value !== 'object')
    return;

  if (Array.isArray(value)) {
    if (value.length > maximumArrayItems)
      state.errors.push(`${path} must not contain more than ${maximumArrayItems} items.`);

    for (const [index, item] of value.entries())
      validateProjectValue(item, `${path}.${index}`, depth + 1, state);

    return;
  }

  const entries = Object.entries(value);

  if (entries.length > maximumObjectProperties)
    state.errors.push(`${path} must not contain more than ${maximumObjectProperties} properties.`);

  for (const [key, item] of entries) {
    const itemPath = `${path}.${key}`;

    if (key.length > 128)
      state.errors.push(`${itemPath} has a property name longer than 128 characters.`);

    if (['__proto__', 'constructor', 'prototype'].includes(key))
      state.errors.push(`${itemPath} uses a prohibited property name.`);

    if (prohibitedProjectKeyPattern.test(key) || eventHandlerKeyPattern.test(key))
      state.errors.push(`${itemPath} may not contain executable browser code.`);

    if (['tagName', 'type'].includes(key) && typeof item === 'string' && isProhibitedElementName(item))
      state.errors.push(`${itemPath} contains a prohibited element.`);

    if (typeof item === 'string')
      validateContextualProjectString(key, item, itemPath, state);

    validateProjectValue(item, itemPath, depth + 1, state);
  }
}

function validateProjectString(
  value: string,
  path: string,
  state: ProjectValidationState,
): void {
  if (value.length > maximumProjectStringLength)
    state.errors.push(`${path} must not exceed ${maximumProjectStringLength} characters.`);

  if (containsControlCharacter(value))
    state.errors.push(`${path} contains a prohibited control character.`);

  if (prohibitedElementPattern.test(decodeHtmlEntities(value)))
    state.errors.push(`${path} contains a prohibited element.`);

  if (eventHandlerAttributePattern.test(decodeHtmlEntities(value)))
    state.errors.push(`${path} contains an inline event handler.`);

  if (dangerousCssPattern.test(normalizeCss(value)))
    state.errors.push(`${path} contains executable CSS.`);
}

function validateContextualProjectString(
  key: string,
  value: string,
  path: string,
  state: ProjectValidationState,
): void {
  const normalizedKey = key.toLowerCase();

  if (normalizedKey === 'html' || (normalizedKey === 'content' && value.includes('<')))
    validateHtml(value, path, state.canonicalOrigin, state.mediaPaths, state.errors);

  if (normalizedKey === 'css' || normalizedKey === 'style' || value.toLowerCase().includes('url('))
    validateCss(value, path, state.canonicalOrigin, state.mediaPaths, state.errors);

  if (mediaAttributeNames.has(normalizedKey)) {
    if (normalizedKey === 'srcset')
      validateSourceSet(value, path, state.canonicalOrigin, state.mediaPaths, state.errors);
    else
      validateMediaUrl(value, path, state.canonicalOrigin, state.mediaPaths, state.errors);
  }

  if (navigationAttributeNames.has(normalizedKey))
    validateNavigationUrl(value, path, state.canonicalOrigin, state.errors);
}

function validateHtml(
  html: string,
  path: string,
  canonicalOrigin: string,
  mediaPaths: ReadonlySet<string>,
  errors: string[],
): void {
  const normalizedHtml = decodeHtmlEntities(html);

  if (containsControlCharacter(html))
    errors.push(`${path} contains a prohibited control character.`);

  if (prohibitedElementPattern.test(normalizedHtml))
    errors.push(`${path} contains a prohibited element.`);

  if (eventHandlerAttributePattern.test(normalizedHtml))
    errors.push(`${path} contains an inline event handler.`);

  if (/\bsrcdoc\s*=/i.test(normalizedHtml))
    errors.push(`${path} contains a prohibited srcdoc attribute.`);

  const attributePattern = /\b(action|formaction|href|poster|src|srcset|style|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  const attributeAssignmentCount = (
    normalizedHtml.match(/\b(?:action|formaction|href|poster|src|srcset|style|xlink:href)\s*=/gi) ?? []
  ).length;
  let parsedAttributeCount = 0;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(normalizedHtml)) !== null) {
    parsedAttributeCount += 1;
    const name = match[1]?.toLowerCase() ?? '';
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    const attributePath = `${path}.${name}`;

    if (name === 'style') {
      validateCss(value, attributePath, canonicalOrigin, mediaPaths, errors);
      continue;
    }

    if (name === 'srcset') {
      validateSourceSet(value, attributePath, canonicalOrigin, mediaPaths, errors);
      continue;
    }

    if (mediaAttributeNames.has(name)) {
      validateMediaUrl(value, attributePath, canonicalOrigin, mediaPaths, errors);
      continue;
    }

    validateNavigationUrl(value, attributePath, canonicalOrigin, errors);
  }

  if (attributeAssignmentCount !== parsedAttributeCount)
    errors.push(`${path} contains a malformed URL or style attribute.`);
}

function validateCss(
  css: string,
  path: string,
  canonicalOrigin: string,
  mediaPaths: ReadonlySet<string>,
  errors: string[],
): void {
  const normalizedCss = normalizeCss(css);

  if (containsControlCharacter(css))
    errors.push(`${path} contains a prohibited control character.`);

  if (dangerousCssPattern.test(normalizedCss))
    errors.push(`${path} contains executable CSS.`);

  const urlPattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)'";]+))\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(normalizedCss)) !== null)
    validateMediaUrl(match[1] ?? match[2] ?? match[3] ?? '', `${path}.url`, canonicalOrigin, mediaPaths, errors);

  const urlTokenCount = (normalizedCss.match(/url\s*\(/gi) ?? []).length;
  const parsedUrlCount = [...normalizedCss.matchAll(urlPattern)].length;

  if (urlTokenCount !== parsedUrlCount)
    errors.push(`${path} contains a malformed CSS URL.`);
}

function validateSourceSet(
  sourceSet: string,
  path: string,
  canonicalOrigin: string,
  mediaPaths: ReadonlySet<string>,
  errors: string[],
): void {
  for (const [index, candidate] of sourceSet.split(',').entries()) {
    const url = candidate.trim().split(/\s+/, 1)[0] ?? '';

    validateMediaUrl(url, `${path}.${index}`, canonicalOrigin, mediaPaths, errors);
  }
}

function validateMediaUrl(
  rawValue: string,
  path: string,
  canonicalOrigin: string,
  mediaPaths: ReadonlySet<string>,
  errors: string[],
): void {
  const normalizedValue = normalizeUrlValue(rawValue);

  if (normalizedValue === '') {
    errors.push(`${path} must reference a configured media asset.`);
    return;
  }

  const mediaPath = readSameOriginPath(normalizedValue, canonicalOrigin);

  if (mediaPath === null || !mediaPaths.has(mediaPath))
    errors.push(`${path} must reference a configured media asset from the canonical site origin.`);
}

function validateNavigationUrl(
  rawValue: string,
  path: string,
  canonicalOrigin: string,
  errors: string[],
): void {
  const value = normalizeUrlValue(rawValue);

  if (/^#(?:[a-z0-9][a-z0-9-]*)?$/i.test(value) || /^mailto:[^\s<>]+$/i.test(value) || /^tel:[+0-9()-]+$/i.test(value))
    return;

  if (readSameOriginPath(value, canonicalOrigin) !== null)
    return;

  errors.push(`${path} must use a relative URL or the canonical site origin.`);
}

function collectApprovedMediaPaths(
  document: SiteDocument,
  canonicalOrigin: string,
  errors: string[],
): ReadonlySet<string> {
  const paths = new Set<string>();

  for (const asset of document.media) {
    const rawPath = asset['path'];

    if (typeof rawPath !== 'string')
      continue;

    const path = readSameOriginPath(normalizeUrlValue(rawPath), canonicalOrigin);

    if (path === null) {
      errors.push(`media.${String(asset['id'] ?? 'unknown')}.path must use the canonical site origin.`);
      continue;
    }

    paths.add(path);
  }

  return paths;
}

function readCanonicalOrigin(value: unknown): string {
  if (typeof value !== 'string')
    return '';

  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function readSameOriginPath(value: string, canonicalOrigin: string): string | null {
  if (value.startsWith('//') || canonicalOrigin === '')
    return null;

  try {
    const url = value.startsWith('/')
      ? new URL(value, canonicalOrigin)
      : new URL(value);

    if (url.protocol !== 'https:' || url.origin !== canonicalOrigin || url.username !== '' || url.password !== '')
      return null;

    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function normalizeUrlValue(value: string): string {
  return Array.from(decodeHtmlEntities(value).trim())
    .filter((character) => character.charCodeAt(0) > 32)
    .join('');
}

function normalizeCss(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_match, codePoint: string) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
    .replace(/\\([\s\S])/g, '$1');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_match, codePoint: string) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
    .replace(/&#([0-9]+);?/g, (_match, codePoint: string) => String.fromCodePoint(Number.parseInt(codePoint, 10)))
    .replace(/&(colon|tab|newline);?/gi, (_match, entity: string) => ({
      colon: ':',
      newline: '\n',
      tab: '\t',
    })[entity.toLowerCase()] ?? '');
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.charCodeAt(0);

    return codePoint === 127 || (codePoint < 32 && ![9, 10, 13].includes(codePoint));
  });
}

function isProhibitedElementName(value: string): boolean {
  return /^(?:base|embed|frame|frameset|iframe|link|meta|object|script|style)$/i.test(value.trim());
}
