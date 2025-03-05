function parseOptionalInt(text?: string) {
  if (text == undefined) return undefined
  return parseInt(text)
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
  redirectAfterSignIn: '/chat',

  oidc: {
    path: '/api/oauth/oidc',
    callback: `${process.env.APP_URL}`,
    redirectUrl: `${process.env.APP_URL}` + '/api/oauth/oidc',
  },

  // SAML Jackson configuration
  saml: {
    issuer: `${process.env.APP_URL}`,
    path: '/api/oauth/saml',
    callback: `${process.env.APP_URL}`,
    redirectUrl: `${process.env.APP_URL}` + '/api/oauth/saml',
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
    secret: process.env.NEXTAUTH_SECRET,
    // We use very long session tokens, and periodically verify the user is still authorized
    // IdP expiration is not used at all
    sessionTokenDuration: 90 * 24 * 60 * 60,
  },

  groupPrefix: 'logicle-',
  sso: {
    locked: process.env.SSO_CONFIG_LOCK == '1',
  },
  backends: {
    locked: process.env.LLM_PROVIDER_CONFIG_LOCK == '1',
  },
  workspaces: {
    enable: process.env.ENABLE_WORKSPACES == '1',
  },
  tools: {
    enable: process.env.ENABLE_TOOLS == '1',
    openApi: {
      requireConfirmation: process.env.OPENAPI_TOOL_REQUIRE_CONFIRM == '1',
    },
  },
  logicleCloud: {
    enable: process.env.ENABLE_LOGICLE_CLOUD_IMAGE_PROXY == '1',
    images: {
      proxyBaseUrl:
        process.env.ENABLE_LOGICLE_CLOUD_IMAGE_PROXY == '1'
          ? `${process.env.LOGICLE_CLOUD_IMAGE_PROXY_URL}`
          : 'https://api.openai.com/v1',
    },
  },
  signup: {
    enable: process.env.ENABLE_SIGNUP == '1',
  },
  chat: {
    enableSharing: process.env.ENABLE_CHAT_SHARING == '1',
    autoSummary: {
      enable: process.env.ENABLE_CHAT_AUTOSUMMARY == '1',
      useChatBackend: process.env.CHAT_AUTOSUMMARY_USE_CHAT_BACKEND == '1',
      maxLength: 500,
    },
    attachments: {
      enable: process.env.ENABLE_CHAT_ATTACHMENTS == '1',
      allowedFormats: process.env.CHAT_ATTACHMENTS_ALLOWED_FORMATS ?? '',
      maxImgDimPx: parseInt(process.env.CHAT_ATTACHMENTS_MAX_IMG_DIM_PX ?? '2048'),
    },
  },
  provision: {
    source: process.env.PROVISION_PATH,
  },
  fileStorage: {
    location: process.env.FILE_STORAGE_LOCATION,
    cacheSizeInMb: parseFloat(process.env.FILE_STORAGE_CACHE_SIZE_MB ?? '0'),
    encryptionProvider: process.env.FILE_STORAGE_ENCRYPTION_PROVIDER || 'pgp',
    encryptionKey: process.env.FILE_STORAGE_ENCRYPTION_KEY ?? 'CHANGEIT',
    encryptFiles: process.env.FILE_STORAGE_ENCRYPTION_ENABLE == '1',
  },
  apiKeys: {
    enable: process.env.ENABLE_APIKEYS == '1',
  },
  openapi: {
    timeoutSecs: parseFloat(process.env.OPENAPI_FETCH_TIMEOUT_SECS ?? '3600'),
  },
  assistantKnowledge: {
    mode: process.env.ASSISTANT_KNOWLEDGE as 'tool' | 'prompt' | 'none',
  },
  dumpLlmConversation: process.env.DUMP_LLM_CONVERSATION == '1',
  conversationLimit: parseOptionalInt(process.env.MAX_CONVERSATION_RESULTS),
}

export default env
