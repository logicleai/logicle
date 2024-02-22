export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const sd = await import('./db/migrations')
    console.log('Seeding the database')
    await sd.migrateToLatest()
  }
}
