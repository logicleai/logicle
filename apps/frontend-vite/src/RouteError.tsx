import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

// Root-level errorElement — catches anything an individual route's lazy
// module throws, either at import time or during render, and shows a
// branded page instead of React Router's raw default error screen (a bare
// stack trace, no navigation back into the app). Also serves as the element
// for the `*` catch-all route (see router.tsx) for a genuinely unmatched
// URL, via the `isRouteErrorResponse` 404 branch below.
export function RouteError() {
  const error = useRouteError()
  // No error at all means this rendered as the plain `*` catch-all match
  // (see router.tsx), not via an errorElement — genuinely unmatched URL.
  const notFound = !error || (isRouteErrorResponse(error) && error.status === 404)

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
      <h1>{notFound ? 'Page not found' : 'Something went wrong'}</h1>
      <p className="opacity-70">
        {notFound
          ? "The page you're looking for doesn't exist."
          : 'This page failed to load. Try going back, or reload the app.'}
      </p>
      <Link to="/chat">Back to chat</Link>
    </div>
  )
}
