function parseOptionalInt(text?: string) {
  if (text === undefined) return undefined
  return parseInt(text, 10)
}

function parseOptionalFloat(text?: string) {
  if (text === undefined) return undefined
  const value = parseFloat(text)
  return Number.isNaN(value) ? undefined : value
}

const env = {
  databaseUrl: `${process.env.DATABASE_URL}`,
  appUrl: `${process.env.APP_URL}`,

  get isHttps() {
    // Using a getter to dynamically check the protocol every time `isHttps` is accessed.
    const protocolMatch = this.appUrl.match(/^(https?):\/\//)
    return protocolMatch ? protocolMatch[1] === 'https' : false
  },

  product: 'logicle',
  appDisplayName: process.env.APP_DISPLAY_NAME ?? 'Logicle',
  redirectAfterSignIn: '/chat',

  oidc: {
    path: '/api/oauth/oidc',
    callback: `${process.env.APP_URL}`,
    redirectUrl: `${process.env.APP_URL}/api/oauth/oidc`,
  },

  // SAML Jackson configuration
  saml: {
    issuer: `${process.env.APP_URL}`,
    path: '/api/oauth/saml',
    callback: `${process.env.APP_URL}`,
    redirectUrl: `${process.env.APP_URL}/api/oauth/saml`,
  },

  // SMTP configuration for NextAuth
  smtp: {
    host: '',
    port: Number(''),
    user: '',
    password: '',
    from: '',
  },
  /*smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM,
  },*/

  // NextAuth configuration
  nextAuth: {
    secret: process.env.NEXTAUTH_SECRET ?? '',
  },
  session: {
    // Session lifetime from last refresh (hours); used for DB expiry + cookie expiry.
    ttlHours: parseOptionalInt(process.env.SESSION_TTL_HOURS) ?? 24 * 7,
    // Client refresh interval (minutes); UI calls /api/auth/refresh on this cadence.
    refreshIntervalMinutes: parseOptionalFloat(process.env.SESSION_REFRESH_INTERVAL_MINUTES) ?? 30,
    // Minimum time between refresh attempts (minutes); prevents rapid retries.
    refreshThrottleMinutes: parseOptionalFloat(process.env.SESSION_REFRESH_THROTTLE_MINUTES) ?? 0.5,
  },

  groupPrefix: 'logicle-',
  sso: {
    locked: process.env.SSO_CONFIG_LOCK === '1',
  },
  backends: {
    locked: process.env.LLM_PROVIDER_CONFIG_LOCK === '1',
  },
  workspaces: {},
  tools: {
    openApi: {
      requireConfirmation: process.env.OPENAPI_TOOL_REQUIRE_CONFIRM === '1',
      timeoutSecs: parseFloat(process.env.OPENAPI_FETCH_TIMEOUT_SECS ?? '3600'),
    },
    websearch: {
      defaultApiUrl: process.env.WEBSEARCH_TOOL_DEFAULT_API_URL ?? 'https://api.exa.ai/search',
    },
    imagegen: {
      proxyBaseUrl:
        process.env.ENABLE_LOGICLE_CLOUD_IMAGE_PROXY === '1'
          ? `${process.env.LOGICLE_CLOUD_IMAGE_PROXY_URL}`
          : 'https://api.openai.com/v1',
    },
    mcp: {
      clientCacheTtlSeconds: parseOptionalInt(process.env.MCP_CLIENT_CACHE_TTL_SECONDS) ?? 300,
      clientCacheMaxItems: parseOptionalInt(process.env.MCP_CLIENT_CACHE_MAX_ITEMS) ?? 100,
    },
  },
  providers: {
    openai: {},
    logicle: {},
  },
  signup: {
    enable: process.env.ENABLE_SIGNUP === '1',
  },
  chat: {
    enableSharing: process.env.ENABLE_CHAT_SHARING === '1',
    enableFolders: process.env.ENABLE_CHAT_FOLDERS === '1',
    enableShowToolResult: process.env.ENABLE_SHOW_TOOL_RESULT === '1',
    enableTreeNavigation: process.env.ENABLE_CHAT_TREE_NAVIGATION === '1',
    enableAttachmentConversion: process.env.ENABLE_CHAT_ATTACHMENT_CONVERSION === '1',
    autoSummary: {
      enable: process.env.ENABLE_CHAT_AUTOSUMMARY === '1',
      useChatBackend: process.env.CHAT_AUTOSUMMARY_USE_CHAT_BACKEND === '1',
      maxLength: 500,
    },
    attachments: {
      allowedFormats: process.env.CHAT_ATTACHMENTS_ALLOWED_FORMATS ?? '',
      maxImgDimPx: parseInt(process.env.CHAT_ATTACHMENTS_MAX_IMG_DIM_PX ?? '2048', 10),
      maxSize: parseInt(process.env.CHAT_ATTACHMENTS_MAX_SIZE ?? '50000000', 10),
    },
    maxOutputTokens: parseOptionalInt(process.env.CHAT_MAX_OUTPUT_TOKENS),
  },
  assistants: {
    enableInfo: process.env.ENABLE_ASSISTANT_INFO === '1',
    enableDuplicate: process.env.ENABLE_ASSISTANT_DUPLICATE === '1',
  },
  knowledge: {
    sendInPrompt: process.env.KNOWLEDGE_SEND_IN_PROMPT !== '0',
    alwaysConvertToText: process.env.KNOWLEDGE_ALWAYS_CONVERT !== '0',
  },
  provision: {
    config: process.env.PROVISION_PATH,
    brand: process.env.PROVISION_BRAND_PATH,
    models: process.env.PROVISION_MODELS_PATH,
  },
  fileStorage: {
    location: process.env.FILE_STORAGE_LOCATION,
    cacheSizeInMb: parseFloat(process.env.FILE_STORAGE_CACHE_SIZE_MB ?? '0'),
    encryptionProvider: process.env.FILE_STORAGE_ENCRYPTION_PROVIDER || 'pgp',
    encryptionKey: process.env.FILE_STORAGE_ENCRYPTION_KEY ?? 'CHANGEIT',
    encryptFiles: process.env.FILE_STORAGE_ENCRYPTION_ENABLE === '1',
  },
  apiKeys: {
    enable: process.env.ENABLE_APIKEYS === '1',
    enableUi: process.env.ENABLE_APIKEYS_UI === '1',
  },
  dumpLlmConversation: process.env.DUMP_LLM_CONVERSATION === '1',
  conversationLimit: parseOptionalInt(process.env.MAX_CONVERSATION_RESULTS),
  search: {
    url: process.env.EXTERNAL_SEARCH_URL,
  },
  textConversion: {
    xlsx: {
      favourExcelJs: process.env.FAVOUR_EXCELJS === '1',
    },
  },
  icons: {
    favicon: process.env.FAVICON_PATH || '/favicon.ico',
    logo: process.env.LOGO_PATH,
  },
}

export default env
