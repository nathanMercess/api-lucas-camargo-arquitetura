import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SiteDocument } from './site-document.model.js';
import { validateVisualBuilderDocument } from './validate-visual-builder-document.js';
import { VisualBuilderDocument } from './visual-builder-document.model.js';
import { VisualBuilderProjectValue } from './visual-builder-project-value.type.js';

const publicSiteConfig = JSON.parse(readFileSync(
  new URL('../../test/fixtures/site-config.v1.json', import.meta.url),
  'utf-8',
)) as SiteDocument;
const approvedImagePath = '/assets/editorial/architecture-reference.jpg';

describe('validateVisualBuilderDocument', () => {
  it('accepts editor HTML, CSS, configured media and bounded GrapesJS project data', () => {
    const document = createVisualDocument({
      enabled: true,
      html: `<main class="lc-page"><img src="${approvedImagePath}" alt="Projeto"><a href="/portfolio">Portfólio</a></main>`,
      css: `.lc-page { background-image: url('${approvedImagePath}'); color: #202832; }`,
      projectData: {
        assets: [{ src: approvedImagePath, type: 'image' }],
        pages: [{
          id: 'home',
          component: {
            tagName: 'main',
            components: [{ tagName: 'img', attributes: { src: approvedImagePath } }],
          },
        }],
        styles: [{ selectors: ['lc-page'], style: { color: '#202832' } }],
        __visualBuilderAdmin: {
          version: 1,
          page: { id: 'home', name: 'Página inicial', slug: '/' },
          savedTemplates: [],
        },
      },
    });

    expect(validateVisualBuilderDocument(document)).toEqual([]);
  });

  it.each([
    ['script', '<script>alert(1)</script>', 'prohibited element'],
    ['iframe', '<iframe src="/portfolio"></iframe>', 'prohibited element'],
    ['object', '<object data="/content/file"></object>', 'prohibited element'],
    ['embed', '<embed src="/content/file">', 'prohibited element'],
    ['inline style element', '<style>@import "https://attacker.invalid/theme.css";</style>', 'prohibited element'],
    ['event handler', '<button onclick="alert(1)">Abrir</button>', 'inline event handler'],
    ['encoded unsafe URL', '<a href="jav&#x61;script:alert(1)">Abrir</a>', 'relative URL or the canonical site origin'],
    ['HTML data URL', '<img src="data:text/html,<script>alert(1)</script>">', 'configured media asset'],
    ['external media', '<img src="https://attacker.invalid/tracker.png">', 'configured media asset'],
  ])('rejects unsafe %s in rendered HTML', (_name, html, expectedError) => {
    const errors = validateVisualBuilderDocument(createVisualDocument({ html }));

    expect(errors.join(' ')).toContain(expectedError);
  });

  it.each([
    ['CSS import', '@import "https://attacker.invalid/theme.css";', 'executable CSS'],
    ['CSS expression', '.item { width: expression(alert(1)); }', 'executable CSS'],
    ['encoded JavaScript CSS', '.item { background: url("\\6a avascript:alert(1)"); }', 'executable CSS'],
    ['external CSS media', '.item { background: url("https://attacker.invalid/image.jpg"); }', 'configured media asset'],
  ])('rejects %s', (_name, css, expectedError) => {
    const errors = validateVisualBuilderDocument(createVisualDocument({ css }));

    expect(errors.join(' ')).toContain(expectedError);
  });

  it('rejects executable component data even when rendered HTML is empty', () => {
    const document = createVisualDocument({
      projectData: {
        pages: [{
          component: {
            tagName: 'div',
            script: 'alert(document.cookie)',
            attributes: { onmouseover: 'alert(1)' },
          },
        }],
      },
    });

    expect(validateVisualBuilderDocument(document)).toEqual(expect.arrayContaining([
      expect.stringContaining('may not contain executable browser code'),
    ]));
  });

  it('rejects excessive project depth and object width', () => {
    let deeplyNested: VisualBuilderProjectValue = 'leaf';

    for (let depth = 0; depth < 34; depth += 1)
      deeplyNested = { child: deeplyNested };

    const excessiveProperties = Object.fromEntries(
      Array.from({ length: 513 }, (_value, index) => [`field-${index}`, index]),
    );
    const document = createVisualDocument({
      projectData: { deeplyNested, excessiveProperties },
    });
    const errors = validateVisualBuilderDocument(document);

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('maximum nesting depth'),
      expect.stringContaining('more than 512 properties'),
    ]));
  });

  it('rejects a media inventory URL outside the canonical site origin', () => {
    const document: SiteDocument = {
      ...createVisualDocument(),
      media: publicSiteConfig.media.map((asset, index) => index === 0 ? {
        ...asset,
        path: 'https://attacker.invalid/favicon.ico',
      } : asset),
    };

    expect(validateVisualBuilderDocument(document)).toContain(
      `media.${String(document.media[0]?.['id'])}.path must use the canonical site origin.`,
    );
  });
});

function createVisualDocument(overrides: Partial<VisualBuilderDocument> = {}): SiteDocument {
  return {
    ...publicSiteConfig,
    visualBuilder: {
      enabled: true,
      projectData: {},
      html: '<main class="lc-page"><a href="#">Página inicial</a></main>',
      css: '.lc-page { color: #202832; }',
      ...overrides,
    },
  };
}
