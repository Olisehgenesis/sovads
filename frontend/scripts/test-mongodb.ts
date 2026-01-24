#!/usr/bin/env tsx
/**
 * Test MongoDB Connection Script
 * Usage: tsx scripts/test-mongodb.ts [connection-string]
 */

import { MongoClient } from 'mongodb'

// Get URI from command line argument or environment variable - DO NOT hardcode credentials
const testUri = process.argv[2] || process.env.MONGODB_URI

if (!testUri) {
  console.error('❌ Error: MongoDB connection string is required')
  console.error('💡 Usage: tsx scripts/test-mongodb.ts [connection-string]')
  console.error('💡 Or set MONGODB_URI environment variable')
  process.exit(1)
}

async function testConnection() {
  console.log('🔍 Testing MongoDB Connection...\n')
  console.log(`URI: ${testUri.replace(/:[^:@]+@/, ':****@')}`) // Hide password
  console.log('')

  const client = new MongoClient(testUri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  })

  try {
    console.log('⏳ Connecting to MongoDB...')
    const startTime = Date.now()
    
    await client.connect()
    const connectDuration = Date.now() - startTime
    
    console.log(`✅ Connected successfully! (${connectDuration}ms)\n`)

    // Test 1: Ping
    console.log('📡 Testing ping...')
    const pingStart = Date.now()
    await client.db().admin().ping()
    const pingDuration = Date.now() - pingStart
    console.log(`✅ Ping successful! (${pingDuration}ms)\n`)

    // Test 2: List databases
    console.log('📚 Listing databases...')
    const dbList = await client.db().admin().listDatabases()
    console.log(`✅ Found ${dbList.databases.length} databases:`)
    dbList.databases.forEach((db) => {
      const sizeMB = db.sizeOnDisk ? (db.sizeOnDisk / 1024 / 1024).toFixed(2) : 'unknown'
      console.log(`   - ${db.name} (${sizeMB} MB)`)
    })
    console.log('')

    // Test 3: Access specific database
    const dbName = process.env.MONGODB_DB || 'sovads'
    console.log(`🗄️  Accessing database: ${dbName}...`)
    const db = client.db(dbName)
    
    // Test 4: List collections
    console.log('📋 Listing collections...')
    const collections = await db.listCollections().toArray()
    console.log(`✅ Found ${collections.length} collections:`)
    collections.forEach((col) => {
      console.log(`   - ${col.name}`)
    })
    console.log('')

    // Test 5: Count documents in key collections
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
    console.log('')

    // Test 6: Sample query
    console.log('🔍 Testing sample queries...')
    try {
      const publishersCollection = db.collection('publishers')
      const publisherCount = await publishersCollection.countDocuments({})
      console.log(`✅ Publishers collection accessible: ${publisherCount} documents`)
    } catch (error) {
      console.log(`❌ Publishers query failed: ${error instanceof Error ? error.message : 'Unknown'}`)
    }

    try {
      const campaignsCollection = db.collection('campaigns')
      const campaignCount = await campaignsCollection.countDocuments({})
      console.log(`✅ Campaigns collection accessible: ${campaignCount} documents`)
    } catch (error) {
      console.log(`❌ Campaigns query failed: ${error instanceof Error ? error.message : 'Unknown'}`)
    }

    console.log('\n✅ All tests passed! MongoDB connection is working correctly.')
    
  } catch (error) {
    console.error('\n❌ Connection test failed!')
    console.error('Error:', error instanceof Error ? error.message : String(error))
    
    if (error instanceof Error) {
      if (error.message.includes('ENOTFOUND')) {
        console.error('\n💡 Tip: Check your network connection and MongoDB Atlas whitelist settings.')
      } else if (error.message.includes('authentication')) {
        console.error('\n💡 Tip: Verify your username and password are correct.')
      } else if (error.message.includes('timeout')) {
        console.error('\n💡 Tip: Check your network connection and firewall settings.')
      }
    }
    
    process.exit(1)
  } finally {
    await client.close()
    console.log('\n🔌 Connection closed.')
  }
}

testConnection().catch(console.error)

