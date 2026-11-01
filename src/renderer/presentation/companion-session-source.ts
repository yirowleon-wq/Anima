import type { Bridge } from '../../shared/types';
import type { CompanionSourceInput } from '../../shared/companion-source';
import type { LocalSearchLocator } from '../../shared/search';

export interface CompanionOpenedSource {
  title: string;
  text: string;
  origin: 'user_statement' | 'quotation' | 'assistant_history' | 'material';
  page?: number;
  image?: { dataUrl: string; width: number; height: number };
  continuesOutsideExcerpt?: boolean;
  document?: Extract<LocalSearchLocator, { kind: 'material' }>;
}

/** Open one owner-selected address through existing native reading. No tool,
 * model request, file path or new saved copy is created by this UI helper. */
export async function openCompanionSource(api: Pick<Bridge, 'companionSessionSource' | 'materialsRead'>,
  input: CompanionSourceInput): Promise<CompanionOpenedSource> {
  const source = await api.companionSessionSource(input);
  if (source.kind === 'excerpt') return source;
  const page = await api.materialsRead({ target: { kind: 'saved', resourceId: source.resourceId },
    ...(source.page === undefined ? {} : { page: source.page }), offset: source.offset,
    view: source.mediaType === 'application/pdf' ? 'page' : 'text' });
  if (page.item.resourceId !== source.resourceId || page.item.sha256 !== source.sha256)
    throw new Error('The original file has changed. Reopen the material from this stopping point.');
  // Native reading may yield while another turn changes the working point.
  const current = await api.companionSessionSource(input);
  if (current.kind !== 'file' || current.resourceId !== source.resourceId || current.sha256 !== source.sha256
    || current.version !== source.version || current.offset !== source.offset || current.limit !== source.limit
    || current.page !== source.page)
    throw new Error('The material or stopping point has changed. Reopen it from the current page.');
  const start = Math.max(0, source.offset - page.start), points = Array.from(page.text);
  if (!page.image && (source.offset < page.start || source.offset > page.end))
    throw new Error('This passage is no longer in the original file. Return to the original page.');
  return { title: source.title, text: points.slice(start, start + source.limit).join(''), origin: 'material',
    ...(page.page === undefined ? {} : { page: page.page }), ...(page.image ? { image: page.image } : {}),
    document: { kind: 'material', resourceId: source.resourceId, sha256: source.sha256,
      ...(source.page === undefined ? {} : { page: source.page }), offset: source.offset,
      end: Math.max(source.offset, Math.min(page.total, source.offset + source.limit)), field: 'body' },
    continuesOutsideExcerpt: page.total > source.offset + source.limit };
}
