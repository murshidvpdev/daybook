// The remote MCP connector's endpoint (see backend/app/mcp/) — proxied to EC2
// exactly like /api/*, so Claude reaches it over this domain's HTTPS.
export { onRequest } from "./api/[[path]].js";
