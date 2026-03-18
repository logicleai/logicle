import { NextResponse } from 'next/server'

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Logicle Apis</title>
    <meta name="description" content="Logicle Apis" />
    <link
      rel="icon"
      type="image/x-icon"
      href="https://raw.githubusercontent.com/blomqma/next-rest-framework/main/docs/static/img/favicon.ico"
    />
    <meta property="og:title" content="Next REST Framework" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://next-rest-framework.vercel.app" />
    <meta
      property="og:image"
      content="https://raw.githubusercontent.com/blomqma/next-rest-framework/d02224b38d07ede85257b22ed50159a947681f99/packages/next-rest-framework/logo.svg"
    />
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@4.5.0/swagger-ui.css"
    />
    <style>
      .topbar-wrapper img {
        content: url('https://raw.githubusercontent.com/blomqma/next-rest-framework/d02224b38d07ede85257b22ed50159a947681f99/packages/next-rest-framework/logo.svg');
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script
      src="https://unpkg.com/swagger-ui-dist@4.5.0/swagger-ui-bundle.js"
      crossorigin
    ></script>
    <script
      src="https://unpkg.com/swagger-ui-dist@4.5.0/swagger-ui-standalone-preset.js"
      crossorigin
    ></script>
    <script>
      window.onload = () => {
        document.title = 'Logicle Apis';
        window.ui = SwaggerUIBundle({
          url: '/openapi.yaml',
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: 'StandaloneLayout',
          deepLinking: true,
          displayOperationId: true,
          displayRequestDuration: true,
          filter: true,
        });
      };
    </script>
  </body>
</html>`

export async function GET() {
  return new NextResponse(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  })
}
