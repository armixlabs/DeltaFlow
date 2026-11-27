/// <reference types="node" />

import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { signAdonisRequest } from './server/adonisSigning'

// All connection settings come from environment variables (see setenv.sh).
// Credentials stay on the server: the proxies below attach them to the outgoing
// requests, so they never become part of the client bundle.
const readEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

// Non-secret settings the client needs; exposed to it as __DELTAFLOW_CONFIG__.
const PUBLIC_CONFIG_KEYS = [
  'ADO_REST_HOST',
  'ADO_REST_REPO',
  'ADO_REST_ROOTMODELGROUP',
  'ADONIS_API_BASE',
  'ADONIS_PROXY_PATH',
  'ADONIS_USE_PROXY',
  'GEMINI_MODEL',
  'GEMINI_TIMEOUT_MS',
  'OPENAI_MODEL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_HAIKU_MODEL',
];

const createPublicConfig = (): Record<string, string> => {
  const config: Record<string, string> = {};
  for (const key of PUBLIC_CONFIG_KEYS) {
    const value = readEnv(key);
    if (value) {
      config[key] = value;
    }
  }
  return config;
};

interface ProxyRoutes {
  proxy: Record<string, ProxyOptions>;
  // Route prefix -> names of the environment variables that are missing for it.
  unavailable: Record<string, string[]>;
}

const stripPrefix = (prefix: string) => (path: string) => path.slice(prefix.length);

const createProxyRoutes = (): ProxyRoutes => {
  const routes: ProxyRoutes = { proxy: {}, unavailable: {} };

  const addRoute = (prefix: string, requiredEnv: string[], createOptions: () => ProxyOptions) => {
    const missing = requiredEnv.filter((name) => !readEnv(name));
    if (missing.length > 0) {
      console.warn(`[Deltaflow] ${missing.join(', ')} not set. The ${prefix} route will be disabled.`);
      routes.unavailable[prefix] = missing;
      return;
    }
    routes.proxy[prefix] = { changeOrigin: true, rewrite: stripPrefix(prefix), ...createOptions() };
  };

  addRoute('/proxy', ['ADO_REST_HOST'], () => {
    const identifier = readEnv('ADO_REST_IDENTIFIER');
    const secret = readEnv('ADO_REST_SECRET');
    if (!identifier || !secret) {
      console.warn('[Deltaflow] ADO_REST_IDENTIFIER / ADO_REST_SECRET not set. ADONIS requests will not be signed.');
    }

    return {
      target: `https://${readEnv('ADO_REST_HOST')}`,
      secure: false,
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq, req) => {
          // Requests the client signed itself (credentials entered in the config dialog) pass through untouched.
          if (!identifier || !secret || req.headers['x-axw-rest-token']) {
            return;
          }
          const { searchParams } = new URL(req.url ?? '/', 'http://localhost');
          const authHeaders = signAdonisRequest({
            identifier,
            secret,
            queryParams: Object.fromEntries(searchParams),
          });
          for (const [name, value] of Object.entries(authHeaders)) {
            proxyReq.setHeader(name, value);
          }
        });
      },
    };
  });

  addRoute('/gemini-proxy', ['GEMINI_API_BASE', 'GEMINI_API_KEY'], () => ({
    target: readEnv('GEMINI_API_BASE'),
    secure: true,
    headers: {
      'x-goog-api-key': readEnv('GEMINI_API_KEY') as string,
    },
  }));

  addRoute('/openai-proxy', ['OPENAI_API_BASE', 'OPENAI_API_KEY'], () => ({
    target: readEnv('OPENAI_API_BASE'),
    secure: true,
    headers: {
      authorization: `Bearer ${readEnv('OPENAI_API_KEY')}`,
    },
  }));

  addRoute('/anthropic-proxy', ['ANTHROPIC_API_BASE', 'ANTHROPIC_API_KEY', 'ANTHROPIC_VERSION'], () => ({
    target: readEnv('ANTHROPIC_API_BASE'),
    secure: true,
    headers: {
      'x-api-key': readEnv('ANTHROPIC_API_KEY') as string,
      'anthropic-version': readEnv('ANTHROPIC_VERSION') as string,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
  }));

  return routes;
};

// Answers requests to routes that are disabled because of missing environment
// variables, so the UI shows the cause instead of an unrelated parsing error.
const unavailableRoutesPlugin = (unavailable: Record<string, string[]>): Plugin => {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';
    const prefix = Object.keys(unavailable).find((route) => url === route || url.startsWith(`${route}/`));
    if (!prefix) {
      next();
      return;
    }
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: `Environment variable(s) ${unavailable[prefix].join(', ')} not set on the server. Run "source ./setenv.sh" and restart it.`,
      })
    );
  };

  return {
    name: 'deltaflow-unavailable-routes',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig(() => {
  const routes = createProxyRoutes();

  return {
    define: {
      __DELTAFLOW_CONFIG__: JSON.stringify(createPublicConfig()),
    },
    plugins: [react(), unavailableRoutesPlugin(routes.unavailable)],
    server: {
      proxy: routes.proxy,
    },
    preview: {
      proxy: routes.proxy,
    },
  };
});
