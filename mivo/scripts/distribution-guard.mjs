const mode = process.env.MIVO_DISTRIBUTION_MODE || 'personal_noncommercial'
if (mode !== 'personal_noncommercial') {
  throw new Error('MIVO_DISTRIBUTION_BLOCKED: LICENSE.details prohibits commercial secondary development. Obtain permission or replace the desktop shell before commercial builds.')
}
console.log(`Mivo distribution: ${mode}`)
