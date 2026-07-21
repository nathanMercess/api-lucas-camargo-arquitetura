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

  return errors;
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
