// Convex V8 runtime exposes process.env for environment variables.
// See: https://docs.convex.dev/production/environment-variables
declare const process: {
  env: Record<string, string | undefined>
}
