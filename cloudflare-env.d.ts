declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    JINA_API_KEY?: string;
    BILIBILI_MCP_API_URL?: string;
    BILIBILI_MCP_API_TOKEN?: string;
    BUCKET?: R2Bucket;
  }
}
