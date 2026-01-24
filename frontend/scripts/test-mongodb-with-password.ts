#!/usr/bin/env tsx
/**
 * Test MongoDB Connection - accepts password as argument
 * Usage: tsx scripts/test-mongodb-with-password.ts [password]
 */

import { MongoClient, ServerApiVersion } from 'mongodb'

// Get password from command line argument or environment variable
const password = process.argv[2] || process.env.MONGODB_PASSWORD

if (!password) {
  console.error('❌ Error: MongoDB password is required')
  console.error('💡 Usage: tsx scripts/test-mongodb-with-password.ts [password]')
  console.error('💡 Or set MONGODB_PASSWORD environment variable')
  process.exit(1)
}

// Get username and cluster from environment or use defaults
const username = process.env.MONGODB_USERNAME || 'sovads'
const cluster = process.env.MONGODB_CLUSTER || 'cluster0.ozxjq7p.mongodb.net'
const uri = `mongodb+srv://${username}:${password}@${cluster}/?appName=Cluster0`

async function run() {
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  })

  try {
    console.log('🔍 Testing MongoDB Connection...')
    console.log(`URI: ${uri.replace(/:[^:@]+@/, ':****@')}`)
    console.log(`Username: sovads`)
    console.log(`Password: ${'*'.repeat(password.length)}`)
    console.log('')

    console.log('⏳ Connecting to MongoDB...')
    const startTime = Date.now()
    
    await client.connect()
    const connectDuration = Date.now() - startTime
    console.log(`✅ Connected successfully! (${connectDuration}ms)\n`)

    console.log('📡 Sending ping...')
    const pingStart = Date.now()
    await client.db("admin").command({ ping: 1 })
    const pingDuration = Date.now() - pingStart
    console.log(`✅ Ping successful! (${pingDuration}ms)\n`)

    // List databases
    console.log('📚 Listing databases...')
    const dbList = await client.db().admin().listDatabases()
    console.log(`✅ Found ${dbList.databases.length} databases:`)
    dbList.databases.forEach((db) => {
      const sizeMB = db.sizeOnDisk ? (db.sizeOnDisk / 1024 / 1024).toFixed(2) : 'unknown'
      console.log(`   - ${db.name} (${sizeMB} MB)`)
    })
    console.log('')

    // Test accessing the sovads database
    const dbName = 'sovads'
    console.log(`🗄️  Accessing database: ${dbName}...`)
    const db = client.db(dbName)
    
    // List collections
    console.log('📋 Listing collections...')
    const collections = await db.listCollections().toArray()
    console.log(`✅ Found ${collections.length} collections:`)
    collections.forEach((col) => {
      console.log(`   - ${col.name}`)
    })
    console.log('')

    // Count documents
    const keyCollections = ['publishers', 'campaigns', 'publisher_sites', 'events']
    console.log('📊 Document counts:')
    for (const colName of keyCollections) {
      try {
        const count = await db.collection(colName).countDocuments()
        console.log(`   - ${colName}: ${count} documents`)
      } catch (error) {
        console.log(`   - ${colName}: Error - ${error instanceof Error ? error.message : 'Unknown'}`)
      }
    }

    console.log('\n✅ All tests passed! MongoDB connection is working correctly.')
    console.log(`\n📝 Connection string for .env:`)
    console.log(`MONGODB_URI="${uri}"`)
    
  } catch (error) {
    console.error('\n❌ Connection test failed!')
    console.error('Error:', error instanceof Error ? error.message : String(error))
    
    if (error instanceof Error) {
      if (error.message.includes('authentication')) {
        console.error('\n💡 Authentication failed! The password is incorrect.')
        console.error('💡 To get the correct password:')
        console.error('   1. Go to MongoDB Atlas: https://cloud.mongodb.com')
        console.error('   2. Navigate to: Database Access')
        console.error('   3. Find user "sovads" and click "Edit"')
        console.error('   4. Click "Edit Password" to see or reset the password')
        console.error('\n💡 Or test with a different password:')
        console.error('   pnpm tsx scripts/test-mongodb-with-password.ts YOUR_PASSWORD')
      }
    }
    
    process.exit(1)
  } finally {
    await client.close()
    console.log('\n🔌 Connection closed.')
  }
}

run().catch(console.error)

