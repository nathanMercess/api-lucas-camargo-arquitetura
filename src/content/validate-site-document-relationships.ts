import { SiteConfigV1 } from './site-config-v1.model.js';
import { SiteConfigV2 } from './site-config-v2.model.js';
import { SiteDocument } from './site-document.model.js';

export function validateSiteDocumentRelationships(document: SiteDocument): readonly string[] {
  const errors: string[] = [];
  const mediaIds = new Set(document.media.map((asset) => readString(asset, 'id')));
  const categoryIds = new Set(
    document.portfolioCategories.map((category) => readString(category, 'id')),
  );

  validateUnique(document.media.map((asset) => readString(asset, 'id')), 'media.id', errors);

  for (const asset of document.media)
    validatePublishedMediaPath(asset, errors);

  validateUnique(
    document.portfolioCategories.map((category) => readString(category, 'id')),
    'portfolioCategories.id',
    errors,
  );
  validateUnique(document.projects.map((project) => readString(project, 'id')), 'projects.id', errors);
  validateUnique(
    document.projects.map((project) => readString(project, 'slug')),
    'projects.slug',
    errors,
  );
  validateUnique(
    document.projects.map((project) => readNumber(project, 'order')),
    'projects.order',
    errors,
  );

  validateMediaId(mediaIds, readString(document.identity, 'logoLightMediaId'), 'identity.logoLightMediaId', errors);
  validateMediaId(mediaIds, readString(document.identity, 'logoDarkMediaId'), 'identity.logoDarkMediaId', errors);
  validateMediaId(mediaIds, readString(document.identity, 'faviconMediaId'), 'identity.faviconMediaId', errors);

  const openGraph = readRecord(document.seo, 'openGraph');
  const twitter = readRecord(document.seo, 'twitter');
  validateMediaId(mediaIds, readString(openGraph, 'imageMediaId'), 'seo.openGraph.imageMediaId', errors);
  validateMediaId(mediaIds, readString(twitter, 'imageMediaId'), 'seo.twitter.imageMediaId', errors);
  validateMediaReference(mediaIds, document.header['logo'], 'header.logo', errors);
  validateMediaReference(mediaIds, document.footer['logo'], 'footer.logo', errors);

  for (const category of document.portfolioCategories) {
    const coverMediaId = category['coverMediaId'];

    if (typeof coverMediaId === 'string')
      validateMediaId(mediaIds, coverMediaId, `portfolioCategories.${readString(category, 'id')}.coverMediaId`, errors);
  }

  validateProjects(document, mediaIds, categoryIds, errors);

  if (document.schemaVersion === 1)
    validateV1Relationships(document, mediaIds, categoryIds, errors);
  else
    validateV2Relationships(document, mediaIds, errors);

  return errors;
}

function validateV1Relationships(
  document: SiteConfigV1,
  mediaIds: ReadonlySet<string>,
  categoryIds: ReadonlySet<string>,
  errors: string[],
): void {
  validateUnique(document.sections.map((section) => readString(section, 'id')), 'sections.id', errors);
  validateUnique(
    document.sections.map((section) => readString(section, 'anchor')),
    'sections.anchor',
    errors,
  );
  validateUnique(
    document.sections.map((section) => readNumber(section, 'order')),
    'sections.order',
    errors,
  );

  for (const section of document.sections) {
    const sectionId = readString(section, 'id');
    const sectionType = readString(section, 'type');

    if (sectionType === 'hero')
      validateMediaReference(mediaIds, section['background'], `sections.${sectionId}.background`, errors);

    if (sectionType === 'about')
      validateMediaReference(mediaIds, section['portrait'], `sections.${sectionId}.portrait`, errors);

    if (sectionType === 'portfolio') {
      for (const categoryId of readStringArray(section, 'categoryIds'))
        validateCategoryId(categoryIds, categoryId, `sections.${sectionId}.categoryIds`, errors);
    }
  }
}

function validateV2Relationships(
  document: SiteConfigV2,
  mediaIds: ReadonlySet<string>,
  errors: string[],
): void {
  const projectIds = new Set(document.projects.map((project) => readString(project, 'id')));

  validateUnique(document.pages.map((page) => page.id), 'pages.id', errors);
  validateUnique(document.pages.map((page) => page.slug), 'pages.slug', errors);
  validateUnique(document.pages.map((page) => page.path), 'pages.path', errors);
  validateUnique(document.pages.map((page) => page.order), 'pages.order', errors);

  const homePages = document.pages.filter((page) => page.slug === 'home');

  if (homePages.length !== 1)
    errors.push('pages must contain exactly one home page.');
  else if (homePages[0]?.visible !== true)
    errors.push('pages.home must be visible.');

  validateV2Contact(document, errors);

  for (const page of document.pages) {
    const pagePath = `pages.${page.id}`;
    const expectedPath = page.slug === 'home' ? '/' : `/${page.slug}`;

    if (page.path !== expectedPath)
      errors.push(`${pagePath}.path must match ${expectedPath}.`);

    validateMediaId(mediaIds, readString(page.seo, 'imageMediaId'), `${pagePath}.seo.imageMediaId`, errors);

    if (readString(page.seo, 'canonicalPath') !== page.path)
      errors.push(`${pagePath}.seo.canonicalPath must match ${page.path}.`);

    validateUnique(page.sections.map((section) => section.id), `${pagePath}.sections.id`, errors);
    validateUnique(page.sections.map((section) => section.anchor), `${pagePath}.sections.anchor`, errors);
    validateUnique(page.sections.map((section) => section.order), `${pagePath}.sections.order`, errors);

    for (const section of page.sections) {
      const sectionPath = `${pagePath}.sections.${section.id}`;

      if (section.type === 'hero') {
        validateMediaReference(mediaIds, section.background, `${sectionPath}.background`, errors);
        continue;
      }

      if (section.type === 'project-grid') {
        validateUnique(section.projectIds, `${sectionPath}.projectIds`, errors);

        for (const projectId of section.projectIds)
          validateProjectId(projectIds, projectId, `${sectionPath}.projectIds`, errors);

        continue;
      }

      if (section.type === 'whatsapp-cta' && section.message.trim() === '')
        errors.push(`${sectionPath}.message must not be empty.`);
    }
  }
}

function validateV2Contact(document: SiteConfigV2, errors: string[]): void {
  const organization = readRecord(document.seo, 'organization');

  if (document.contact.email !== readString(organization, 'email'))
    errors.push('contact.email must match seo.organization.email.');

  if (document.contact.phoneE164 !== normalizePhone(readString(organization, 'telephone')))
    errors.push('contact.phoneE164 must match seo.organization.telephone.');

  if (!/^[1-9][0-9]{7,14}$/.test(document.contact.whatsappNumber))
    errors.push('contact.whatsappNumber must contain international digits without a plus sign.');

  try {
    const instagramUrl = new URL(document.contact.instagramUrl);

    if (
      instagramUrl.protocol !== 'https:' ||
      !['instagram.com', 'www.instagram.com'].includes(instagramUrl.hostname.toLowerCase()) ||
      instagramUrl.username !== '' ||
      instagramUrl.password !== ''
    )
      errors.push('contact.instagramUrl must use the official Instagram HTTPS origin.');
  } catch {
    errors.push('contact.instagramUrl must be a valid URL.');
  }
}

function validateProjects(
  document: SiteDocument,
  mediaIds: ReadonlySet<string>,
  categoryIds: ReadonlySet<string>,
  errors: string[],
): void {
  for (const project of document.projects) {
    const projectId = readString(project, 'id');
    const slug = readString(project, 'slug');

    validateMediaReference(mediaIds, project['cover'], `projects.${projectId}.cover`, errors);

    for (const [index, reference] of readRecordArray(project, 'gallery').entries())
      validateMediaReference(mediaIds, reference, `projects.${projectId}.gallery.${index}`, errors);

    const seo = readRecord(project, 'seo');
    validateMediaId(mediaIds, readString(seo, 'imageMediaId'), `projects.${projectId}.seo.imageMediaId`, errors);

    for (const categoryId of readStringArray(project, 'categoryIds'))
      validateCategoryId(categoryIds, categoryId, `projects.${projectId}.categoryIds`, errors);

    if (readString(seo, 'canonicalPath') !== `/portfolio/projeto/${slug}`)
      errors.push(`projects.${projectId}.seo.canonicalPath must match /portfolio/projeto/${slug}.`);
  }
}

function validateUnique(
  values: readonly (number | string)[],
  field: string,
  errors: string[],
): void {
  if (new Set(values).size !== values.length)
    errors.push(`${field} values must be unique.`);
}

function validateMediaReference(
  mediaIds: ReadonlySet<string>,
  value: unknown,
  field: string,
  errors: string[],
): void {
  const reference = value as Readonly<Record<string, unknown>>;
  validateMediaId(mediaIds, readString(reference, 'assetId'), `${field}.assetId`, errors);
}

function validateMediaId(
  mediaIds: ReadonlySet<string>,
  mediaId: string,
  field: string,
  errors: string[],
): void {
  if (!mediaIds.has(mediaId))
    errors.push(`${field} references missing media ${mediaId}.`);
}

function validateCategoryId(
  categoryIds: ReadonlySet<string>,
  categoryId: string,
  field: string,
  errors: string[],
): void {
  if (!categoryIds.has(categoryId))
    errors.push(`${field} references missing category ${categoryId}.`);
}

function validateProjectId(
  projectIds: ReadonlySet<string>,
  projectId: string,
  field: string,
  errors: string[],
): void {
  if (!projectIds.has(projectId))
    errors.push(`${field} references missing project ${projectId}.`);
}

function validatePublishedMediaPath(
  asset: Readonly<Record<string, unknown>>,
  errors: string[],
): void {
  const path = readString(asset, 'path');

  if (!path.startsWith('/content/media/'))
    return;

  const mimeType = readString(asset, 'mimeType');
  const extensionByMimeType: Readonly<Record<string, string>> = {
    'image/avif': 'avif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const extension = extensionByMimeType[mimeType];
  const sha256 = readString(asset, 'sha256');
  const expectedPath = extension === undefined ? '' : `/content/media/${sha256}.${extension}`;

  if (path !== expectedPath)
    errors.push(`media.${readString(asset, 'id')}.path must match its SHA-256 and MIME type.`);
}

function readRecord(
  record: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> {
  return record[key] as Readonly<Record<string, unknown>>;
}

function readRecordArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
): readonly Readonly<Record<string, unknown>>[] {
  return record[key] as readonly Readonly<Record<string, unknown>>[];
}

function readString(record: Readonly<Record<string, unknown>>, key: string): string {
  return record[key] as string;
}

function readStringArray(record: Readonly<Record<string, unknown>>, key: string): readonly string[] {
  return record[key] as readonly string[];
}

function readNumber(record: Readonly<Record<string, unknown>>, key: string): number {
  return record[key] as number;
}

function normalizePhone(value: string): string {
  return `+${value.replace(/[^0-9]/g, '')}`;
}
