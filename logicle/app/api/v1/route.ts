import { docsRoute } from 'next-rest-framework'

// export const runtime = 'edge'; // Edge runtime is supported.

export const { GET } = docsRoute({
  allowedPaths: ['/api/v1/.*'],
  openApiObject: {
    info: {
      title: 'Logicle Apis',
      version: '1.0.0',
      description: 'Logicle Apis',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  openApiJsonPath: '/openapi.json',
  docsConfig: {
    provider: 'swagger-ui', // redoc | swagger-ui
    title: 'My API',
    description: 'My API description.',
    // ...
  },
})
