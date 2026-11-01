/** Credential patterns only. This is not a semantic privacy classifier or an authority to read data. */
const credentialPatterns = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  // A complete BEGIN marker already identifies a key. A truncated file must
  // not escape protection merely because its closing marker is missing.
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|$)/g,
];
export function redactCredentials(text: string) {
  let redacted = text;
  for (const pattern of credentialPatterns) redacted = redacted.replace(pattern, "[Credentials hidden]");
  // RFC 6750 b64token includes ~ + / and trailing =. An Authorization
  // header/JSON field supplies explicit credential context, even for short
  // values. Scheme whitespace stays on this line, never across paragraphs.
  redacted = redacted.replace(/(\bAuthorization["']?[ \t]*[\p{Po}=][ \t]*["']?)Bearer[ \t]+[A-Za-z0-9._~+/-]+=*/giu, "$1[Credentials hidden]");
  // Bare pure-letter terms (e.g. Bearer authentication) are not enough to
  // identify a secret. Keep the existing length floor and require an opaque
  // token shape; ordinary hyphenated words alone do not establish one.
  redacted = redacted.replace(/\bBearer[ \t]+([A-Za-z0-9._~+/-]{12,}=*)/gi,
    (value, token: string) => /[0-9._~+/=]/.test(token.replace(/[.,;:!?]+$/, '')) ? "[Credentials hidden]" : value);
  // Quotes make a value explicit, including spaces or non-ASCII characters.
  // Keep an unfinished quoted value protected through the end of the input.
  redacted = redacted.replace(/(password["']?[ \t]*(?:[\p{Po}=]|\bis\b)[ \t]*)(?:(")(?:\\(?:[\s\S]|$)|[^"\\])+("|$)|(')(?:\\(?:[\s\S]|$)|[^'\\])+('|$)|(“)[^”]+(”|$)|(‘)[^’]+(’|$))/giu,
    (_value, prefix: string, openDouble, closeDouble, openSingle, closeSingle, openCurlyDouble, closeCurlyDouble, openCurlySingle, closeCurlySingle) =>
      prefix + (openDouble || openSingle || openCurlyDouble || openCurlySingle) + "[Credentials hidden]"
      + (closeDouble || closeSingle || closeCurlyDouble || closeCurlySingle || ''));
  // A spoken assignment still needs a value shape. Non-ASCII predicates
  // and ordinary alphabetic words do not establish a secret by themselves.
  // A value also needs an ending; an ASCII fragment of a non-ASCII predicate is
  // not a complete assignment. Quoted values keep their own boundaries.
  redacted = redacted.replace(/(password[ \t]*\bis\b[ \t]*)((?:(?!["'])[\x21-\x7e])+)(?=$|[\s\p{P}])/giu,
    (value, prefix: string, token: string) => /[-0-9._~+/@#$%^&*=|\\!?]/.test(token.replace(/[.,;:!?]+$/, ''))
      ? prefix + "[Credentials hidden]" : value);
  // Punctuation assignments identify a password field. Copula-only phrases
  // also occur in ordinary questions and use the value checks above instead.
  redacted = redacted.replace(/(password["']?[ \t]*[\p{Po}=][ \t]*["']?)[^\s"']{3,}/giu, "$1[Credentials hidden]");
  return redacted;
}
export function hasCredentials(text: string) {
  return redactCredentials(text) !== text;
}
/** Apply before JSON serialization. Keep the tool's real keys and structure;
 * encoded quote layers are not part of the plain-text credential grammar. */
export function redactCredentialValues(value: unknown): any {
  if (typeof value === 'string') return redactCredentials(value);
  if (Array.isArray(value)) return value.map(redactCredentialValues);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      typeof item === 'string' && /^(apiKey|password|cookie|authorization|accessToken|refreshToken|secret)$/i.test(key)
        ? "[Credentials hidden]" : redactCredentialValues(item)]));
  return value;
}
export function redactExport(value: unknown): any {
  if (typeof value === 'string') return redactCredentials(value);
  if (Array.isArray(value)) return value.map(redactExport);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) => !/^(apiKey|password|cookie|authorization|accessToken|refreshToken|secret)$/i.test(key),
        )
        .map(([key, item]) => [key, redactExport(item)]),
    );
  return value;
}
