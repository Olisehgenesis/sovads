#!/usr/bin/env tsx
/**
 * Test MongoDB Connection with new cluster
 */

import { MongoClient, ServerApiVersion } from 'mongodb'

// Get URI from environment variable - DO NOT hardcode credentials
const uri = process.env.MONGODB_URI

if (!uri) {
  console.error('❌ Error: MONGODB_URI environment variable is not set')
  console.error('💡 Set it in your .env file or pass it as an environment variable')
  process.exit(1)
}

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
    console.log('')

    console.log('⏳ Connecting to MongoDB...')
    const startTime = Date.now()
    
    // Connect the client to the server
    await client.connect()
    const connectDuration = Date.now() - startTime
    console.log(`✅ Connected successfully! (${connectDuration}ms)\n`)

    // Send a ping to confirm a successful connection
    console.log('📡 Sending ping...')
    const pingStart = Date.now()
    await client.db("admin").command({ ping: 1 })
    const pingDuration = Date.now() - pingStart
    console.log(`✅ Pinged your deployment. You successfully connected to MongoDB! (${pingDuration}ms)\n`)

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

    // Count documents in key collections
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
    
  } catch (error) {
    console.error('\n❌ Connection test failed!')
    console.error('Error:', error instanceof Error ? error.message : String(error))
    
    if (error instanceof Error) {
      if (error.message.includes('authentication')) {
        console.error('\n💡 Tip: The password might be incorrect. Please verify:')
        console.error('   - Username: sovads')
        console.error('   - Password: Check MongoDB Atlas dashboard')
      } else if (error.message.includes('ENOTFOUND')) {
        console.error('\n💡 Tip: Check your network connection and MongoDB Atlas whitelist settings.')
      }
    }
    
    process.exit(1)
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close()
    console.log('\n🔌 Connection closed.')
  }
}

run().catch(console.error)

