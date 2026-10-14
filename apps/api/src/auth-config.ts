export function authOrigin(env: NodeJS.ProcessEnv): string {
  try {
    const value = env.APP_ORIGIN;
    if (!value) throw new Error();
    const url = new URL(value);
    if (
      url.origin !== value ||
      url.username ||
      url.password ||
      !['http:', 'https:'].includes(url.protocol) ||
      (env.NODE_ENV === 'production' && url.protocol !== 'https:')
    )
      throw new Error();
    return value;
  } catch {
    throw new Error('APP_ORIGIN must be an exact HTTP origin, or HTTPS in production');
  }
}
