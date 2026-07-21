const safeText = {
  type: 'string',
  minLength: 1,
  maxLength: 2_000,
  pattern: '^[^<>]*$',
} as const;
const optionalSafeText = {
  type: 'string',
  maxLength: 2_000,
  pattern: '^[^<>]*$',
} as const;
const identifier = {
  type: 'string',
  minLength: 1,
  maxLength: 64,
  pattern: '^[a-z0-9][a-z0-9-]*$',
} as const;
const mediaPath = {
  type: 'string',
  minLength: 1,
  maxLength: 2_048,
  pattern: '^(?:/[^<>]*|https://[^<>]+)$',
} as const;
const href = {
  type: 'string',
  minLength: 1,
  maxLength: 2_048,
  pattern: '^(?:#[a-z0-9][a-z0-9-]*|/(?!/)[^<>]*|https://[^<>]+|mailto:[^<>]+|tel:[+0-9() -]+)$',
} as const;
const richText = {
  type: 'object',
  required: ['lines'],
  properties: {
    lines: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: {
        type: 'object',
        required: ['segments'],
        properties: {
          segments: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: {
              type: 'object',
              required: ['text', 'emphasis'],
              properties: {
                text: safeText,
                emphasis: { type: 'boolean' },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;
const siteLink = {
  type: 'object',
  required: ['id', 'label', 'href'],
  properties: {
    id: identifier,
    label: safeText,
    href,
    ariaLabel: safeText,
    target: { enum: ['_self', '_blank'] },
  },
  additionalProperties: false,
} as const;
const mediaReference = {
  type: 'object',
  required: ['assetId', 'alt', 'decorative', 'focalPointX', 'focalPointY'],
  properties: {
    assetId: identifier,
    alt: optionalSafeText,
    decorative: { type: 'boolean' },
    focalPointX: { type: 'number', minimum: 0, maximum: 100 },
    focalPointY: { type: 'number', minimum: 0, maximum: 100 },
    caption: safeText,
  },
  additionalProperties: false,
} as const;
const sectionBaseProperties = {
  id: identifier,
  order: { type: 'integer', minimum: 0, maximum: 1_000 },
  visible: { type: 'boolean' },
  anchor: identifier,
} as const;
const sectionBaseRequired = ['id', 'type', 'variant', 'order', 'visible', 'anchor'] as const;
const indexedEditorialItem = {
  type: 'object',
  required: ['id', 'index', 'title', 'description'],
  properties: {
    id: identifier,
    index: safeText,
    title: safeText,
    description: safeText,
  },
  additionalProperties: false,
} as const;
const pageSeo = {
  type: 'object',
  required: ['title', 'description', 'canonicalPath', 'imageMediaId', 'noIndex'],
  properties: {
    title: safeText,
    description: safeText,
    canonicalPath: { type: 'string', pattern: '^/(?!/)[^<>]*$', maxLength: 512 },
    imageMediaId: identifier,
    noIndex: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;
const colorToken = {
  type: 'string',
  pattern: '^(?:#[0-9a-fA-F]{6}|rgb\\([0-9]{1,3} [0-9]{1,3} [0-9]{1,3} / (?:0(?:\\.[0-9]+)?|1(?:\\.0+)?|[0-9]{1,3}%)\\))$',
} as const;

export const siteConfigV1Schema = {
  type: 'object',
  required: [
    'schemaVersion',
    'releaseId',
    'publishedAt',
    'locale',
    'identity',
    'seo',
    'theme',
    'uiLabels',
    'media',
    'header',
    'navigationItems',
    'sections',
    'portfolioCategories',
    'projects',
    'footer',
  ],
  properties: {
    schemaVersion: { type: 'integer', const: 1 },
    releaseId: identifier,
    publishedAt: { type: 'string', format: 'date-time' },
    locale: { const: 'pt-BR' },
    identity: {
      type: 'object',
      required: ['brandName', 'descriptor', 'canonicalUrl', 'logoLightMediaId', 'logoDarkMediaId', 'faviconMediaId'],
      properties: {
        brandName: safeText,
        descriptor: safeText,
        canonicalUrl: { type: 'string', format: 'uri', pattern: '^https://' },
        logoLightMediaId: identifier,
        logoDarkMediaId: identifier,
        faviconMediaId: identifier,
      },
      additionalProperties: false,
    },
    seo: {
      type: 'object',
      required: ['title', 'description', 'canonicalUrl', 'robots', 'themeColor', 'openGraph', 'twitter', 'organization'],
      properties: {
        title: safeText,
        description: safeText,
        canonicalUrl: { type: 'string', format: 'uri', pattern: '^https://' },
        robots: { type: 'string', enum: ['index, follow', 'noindex, nofollow'] },
        themeColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        openGraph: {
          type: 'object',
          required: ['title', 'description', 'type', 'imageMediaId', 'imageAlt'],
          properties: {
            title: safeText,
            description: safeText,
            type: { const: 'website' },
            imageMediaId: identifier,
            imageAlt: safeText,
          },
          additionalProperties: false,
        },
        twitter: {
          type: 'object',
          required: ['card', 'title', 'description', 'imageMediaId', 'imageAlt'],
          properties: {
            card: { const: 'summary_large_image' },
            title: safeText,
            description: safeText,
            imageMediaId: identifier,
            imageAlt: safeText,
          },
          additionalProperties: false,
        },
        organization: {
          type: 'object',
          required: ['name', 'url', 'email', 'telephone', 'addressLocality', 'addressRegion', 'addressCountry'],
          properties: {
            name: safeText,
            url: { type: 'string', format: 'uri', pattern: '^https://' },
            email: { type: 'string', format: 'email', maxLength: 254 },
            telephone: { type: 'string', pattern: '^[+0-9() -]{5,32}$' },
            addressLocality: safeText,
            addressRegion: safeText,
            addressCountry: safeText,
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    theme: {
      type: 'object',
      required: ['presetId', 'colors', 'typography', 'layout', 'motion'],
      properties: {
        presetId: {
          enum: ['lucas-camargo-v1', 'gallery-v1', 'minimal-v1', 'contrast-v1'],
        },
        colors: {
          type: 'object',
          required: ['accent', 'accentSoft', 'ink', 'inkDeep', 'surfaceMuted', 'surface', 'textMuted', 'border', 'focus'],
          properties: Object.fromEntries([
            'accent', 'accentSoft', 'ink', 'inkDeep', 'surfaceMuted', 'surface', 'textMuted', 'border', 'focus',
          ].map((name) => [name, colorToken])),
          additionalProperties: false,
        },
        typography: {
          type: 'object',
          required: ['brandFontFamily', 'dataFontFamily'],
          properties: {
            brandFontFamily: { const: "'Century Gothic', CenturyGothic, 'Avenir Next', Futura, sans-serif" },
            dataFontFamily: { const: "'Cascadia Mono', 'Aptos Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace" },
          },
          additionalProperties: false,
        },
        layout: {
          type: 'object',
          required: ['contentMaxWidthPx', 'pageGutterMinPx', 'pageGutterPreferredVw', 'pageGutterMaxPx'],
          properties: {
            contentMaxWidthPx: { type: 'number', minimum: 960, maximum: 2_560 },
            pageGutterMinPx: { type: 'number', minimum: 8, maximum: 128 },
            pageGutterPreferredVw: { type: 'number', minimum: 1, maximum: 15 },
            pageGutterMaxPx: { type: 'number', minimum: 16, maximum: 256 },
          },
          additionalProperties: false,
        },
        motion: {
          type: 'object',
          required: ['revealEnabled', 'revealDurationMs', 'revealTransformDurationMs'],
          properties: {
            revealEnabled: { type: 'boolean' },
            revealDurationMs: { type: 'integer', minimum: 0, maximum: 10_000 },
            revealTransformDurationMs: { type: 'integer', minimum: 0, maximum: 10_000 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    uiLabels: {
      type: 'object',
      required: [
        'skipToContent', 'mainNavigation', 'footerNavigation', 'openMenu', 'closeMenu', 'pausePortfolio',
        'resumePortfolio', 'referenceImage', 'exploreCategory',
      ],
      properties: Object.fromEntries([
        'skipToContent', 'mainNavigation', 'footerNavigation', 'openMenu', 'closeMenu', 'pausePortfolio',
        'resumePortfolio', 'referenceImage', 'exploreCategory',
      ].map((name) => [name, safeText])),
      additionalProperties: false,
    },
    media: {
      type: 'array',
      maxItems: 2_000,
      items: {
        type: 'object',
        required: ['id', 'path', 'mimeType', 'width', 'height', 'sha256', 'provenance'],
        properties: {
          id: identifier,
          path: mediaPath,
          mimeType: { enum: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/x-icon'] },
          width: { type: 'integer', minimum: 1, maximum: 20_000 },
          height: { type: 'integer', minimum: 1, maximum: 20_000 },
          sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          provenance: { enum: ['brand', 'project', 'reference'] },
        },
        additionalProperties: false,
      },
    },
    header: {
      type: 'object',
      required: ['logo', 'homeLink', 'primaryCta'],
      properties: { logo: mediaReference, homeLink: siteLink, primaryCta: siteLink },
      additionalProperties: false,
    },
    navigationItems: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        required: ['id', 'label', 'href'],
        properties: { id: identifier, label: safeText, href },
        additionalProperties: false,
      },
    },
    sections: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: {
        oneOf: [
          {
            type: 'object',
            required: [...sectionBaseRequired, 'overline', 'title', 'supportingText', 'portfolioLink', 'background', 'indexLabel', 'caption'],
            properties: {
              ...sectionBaseProperties,
              type: { const: 'hero' }, variant: { const: 'editorial-v1' }, overline: safeText, title: richText,
              supportingText: richText, portfolioLink: siteLink, background: mediaReference, indexLabel: safeText, caption: safeText,
            },
            additionalProperties: false,
          },
          {
            type: 'object',
            required: [...sectionBaseRequired, 'indexLabel', 'title', 'body', 'link'],
            properties: {
              ...sectionBaseProperties,
              type: { const: 'manifesto' }, variant: { const: 'editorial-v1' }, indexLabel: safeText, title: richText,
              body: { type: 'array', minItems: 1, maxItems: 20, items: safeText }, link: siteLink,
            },
            additionalProperties: false,
          },
          {
            type: 'object',
            required: [...sectionBaseRequired, 'indexLabel', 'overline', 'title', 'practiceAreas'],
            properties: {
              ...sectionBaseProperties,
              type: { const: 'practice' }, variant: { const: 'editorial-list-v1' }, indexLabel: safeText,
              overline: safeText, title: richText,
              practiceAreas: { type: 'array', minItems: 1, maxItems: 30, items: indexedEditorialItem },
            },
            additionalProperties: false,
          },
          {
            type: 'object',
            required: [...sectionBaseRequired, 'overline', 'title', 'description', 'categoryIds', 'autoRotationEnabled', 'autoRotationIntervalMs'],
            properties: {
              ...sectionBaseProperties,
              type: { const: 'portfolio' }, variant: { const: 'horizontal-accordion-v1' }, overline: safeText, title: richText,
              description: { type: 'array', minItems: 1, maxItems: 20, items: safeText },
              categoryIds: { type: 'array', minItems: 1, maxItems: 50, uniqueItems: true, items: identifier },
              autoRotationEnabled: { type: 'boolean' },
              autoRotationIntervalMs: { type: 'integer', minimum: 2_000, maximum: 120_000 },
            },
            additionalProperties: false,
          },
          {
            type: 'object',
            required: [...sectionBaseRequired, 'indexLabel', 'ariaLabel', 'metrics'],
            properties: {
              ...sectionBaseProperties,
              type: { const: 'metrics' }, variant: { const: 'grid-v1' }, indexLabel: safeText, ariaLabel: safeText,
              metrics: {
                type: 'array', minItems: 1, maxItems: 20,
                items: {
                  type: 'object', required: ['id', 'value', 'label'],
                  properties: { id: identifier, value: safeText, label: safeText }, additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
          {
            type: 'object',
            required: [...sectionBaseRequired, 'profile', 'portrait', 'portraitAriaLabel', 'title', 'link'],
            properties: {
              ...sectionBaseProperties,
              type: { const: 'about' }, variant: { const: 'portrait-v1' },
              profile: {
                type: 'object', required: ['name', 'professionalTitle', 'biography'],
                properties: { name: safeText, professionalTitle: safeText, biography: safeText }, additionalProperties: false,
              },
              portrait: mediaReference, portraitAriaLabel: safeText, title: richText, link: siteLink,
            },
            additionalProperties: false,
          },
          {
            type: 'object',
            required: [...sectionBaseRequired, 'overline', 'title', 'steps'],
            properties: {
              ...sectionBaseProperties,
              type: { const: 'process' }, variant: { const: 'steps-v1' }, overline: safeText, title: safeText,
              steps: { type: 'array', minItems: 1, maxItems: 20, items: indexedEditorialItem },
            },
            additionalProperties: false,
          },
          {
            type: 'object',
            required: [...sectionBaseRequired, 'overline', 'title', 'cta', 'contactChannels'],
            properties: {
              ...sectionBaseProperties,
              type: { const: 'contact' }, variant: { const: 'editorial-v1' }, overline: safeText, title: richText, cta: siteLink,
              contactChannels: {
                type: 'array', minItems: 1, maxItems: 20,
                items: {
                  type: 'object', required: ['id', 'label', 'value'],
                  properties: { id: identifier, label: safeText, value: safeText, href }, additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
        ],
      },
    },
    portfolioCategories: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        required: ['id', 'index', 'title', 'description', 'visualClass'],
        properties: {
          id: identifier, index: safeText, title: safeText, description: safeText,
          visualClass: { enum: ['portfolio-accordion-panel--projects', 'portfolio-accordion-panel--construction'] },
          coverMediaId: identifier,
        },
        additionalProperties: false,
      },
    },
    projects: {
      type: 'array',
      maxItems: 1_000,
      items: {
        type: 'object',
        required: [
          'id', 'slug', 'title', 'summary', 'description', 'categoryIds', 'cover', 'gallery', 'location', 'year',
          'services', 'order', 'visible', 'seo',
        ],
        properties: {
          id: identifier,
          slug: identifier,
          title: safeText,
          summary: safeText,
          description: { type: 'array', minItems: 1, maxItems: 50, items: safeText },
          categoryIds: { type: 'array', minItems: 1, maxItems: 20, uniqueItems: true, items: identifier },
          cover: mediaReference,
          gallery: { type: 'array', maxItems: 100, items: mediaReference },
          location: safeText,
          year: { type: 'string', pattern: '^[0-9]{4}$' },
          services: { type: 'array', maxItems: 50, uniqueItems: true, items: safeText },
          order: { type: 'integer', minimum: 0, maximum: 100_000 },
          visible: { type: 'boolean' },
          seo: pageSeo,
        },
        additionalProperties: false,
      },
    },
    footer: {
      type: 'object',
      required: ['logo', 'links', 'socialLinks', 'statement', 'location', 'copyrightOwner', 'backToTopLink'],
      properties: {
        logo: mediaReference,
        links: {
          type: 'array', maxItems: 30,
          items: {
            type: 'object', required: ['id', 'label', 'href'],
            properties: { id: identifier, label: safeText, href }, additionalProperties: false,
          },
        },
        socialLinks: {
          type: 'array', maxItems: 30,
          items: {
            type: 'object', required: ['id', 'network', 'label', 'href', 'icon'],
            properties: { id: identifier, network: safeText, label: safeText, href, icon: identifier }, additionalProperties: false,
          },
        },
        statement: safeText,
        location: safeText,
        copyrightOwner: safeText,
        backToTopLink: siteLink,
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;
