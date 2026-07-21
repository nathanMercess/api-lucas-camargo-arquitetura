import { ObjectStore } from '../storage/object-store.interface.js';
import { StoredObject } from '../storage/stored-object.model.js';
import { SiteDocument } from './site-document.model.js';

export const draftObjectKey = 'drafts/current.json';

export class DraftService {
  public constructor(private readonly objectStore: ObjectStore) {}

  public getDraft(): Promise<StoredObject<SiteDocument> | null> {
    return this.objectStore.getJson<SiteDocument>(draftObjectKey);
  }

  public createDraft(document: SiteDocument): Promise<StoredObject<SiteDocument>> {
    return this.objectStore.putJson(draftObjectKey, document, {
      ifNoneMatch: '*',
      cacheControl: 'no-store',
    });
  }

  public saveDraft(document: SiteDocument, expectedEtag: string): Promise<StoredObject<SiteDocument>> {
    return this.objectStore.putJson(draftObjectKey, document, {
      ifMatch: expectedEtag,
      cacheControl: 'no-store',
    });
  }

  public synchronizeDraft(document: SiteDocument, expectedEtag: string): Promise<StoredObject<SiteDocument>> {
    return this.saveDraft(document, expectedEtag);
  }
}
