const { ConvexHttpClient } = require('convex/browser')

const convex = new ConvexHttpClient('http://127.0.0.1:3210')

async function seed() {
  console.log('🌱 Seeding Convex database...')

  try {
    // Create organization
    const orgId = await convex.mutation('seed:createDemoOrganization')
    console.log('✅ Created organization:', orgId)

    // Create event
    const eventId = await convex.mutation('seed:createDemoEvent', { organizationId: orgId })
    console.log('✅ Created event:', eventId)

    // Create team Alpha
    const teamAlphaId = await convex.mutation('seed:createDemoTeam', {
      eventId,
      name: 'Équipe Alpha',
      color: '#A6F060',
    })
    console.log('✅ Created team Alpha:', teamAlphaId)

    // Create runners for Alpha
    const alphaRunners = await convex.mutation('seed:createDemoRunners', { teamId: teamAlphaId })
    console.log('✅ Created', alphaRunners.length, 'runners for Alpha')

    // Create team Beta
    const teamBetaId = await convex.mutation('seed:createDemoTeam', {
      eventId,
      name: 'Équipe Beta',
      color: '#60D9F0',
    })
    console.log('✅ Created team Beta:', teamBetaId)

    // Create runners for Beta
    const betaRunners = await convex.mutation('seed:createDemoRunners', { teamId: teamBetaId })
    console.log('✅ Created', betaRunners.length, 'runners for Beta')

    console.log('\n🎉 Database seeded successfully!')
    console.log('\n📊 Summary:')
    console.log('  - Organization:', orgId)
    console.log('  - Event:', eventId)
    console.log('  - Teams:', 2)
    console.log('  - Runners:', alphaRunners.length + betaRunners.length)
  } catch (error) {
    console.error('❌ Error seeding database:', error)
    process.exit(1)
  }
}

seed()