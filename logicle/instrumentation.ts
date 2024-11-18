export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const sd = await import('./db/migrations')
    await sd.migrateToLatest()
    const provision = await import('./lib/provision')
    await provision.provision()
  }
}
