const env = {
  databaseUrl: `${process.env.DATABASE_URL}`,
  appUrl: `${process.env.APP_URL}`,
  isHttps: `${process.env.IS_HTTPS}`,
  product: 'logicle',
  redirectAfterSignIn: '/chat',

  oidc: {
    path: '/api/oauth/oidc',
    callback: `${process.env.APP_URL}`,
    redirectUrl: `${process.env.APP_URL}` + '/api/oauth/oidc',
  },

  // SAML Jackson configuration
  saml: {
    issuer: 'https://saml.logicle.com',
    path: '/api/oauth/saml',
    callback: `${process.env.APP_URL}`,
    redirectUrl: `${process.env.APP_URL}` + '/api/oauth/saml',
  },

  // SMTP configuration for NextAuth
  smtp: {
    host: "",
    port: Number(""),
    user: "",
    password: "",
    from: "",
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
  },

  groupPrefix: 'logicle-',
}

export default env
