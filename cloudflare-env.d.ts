declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    JINA_API_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
