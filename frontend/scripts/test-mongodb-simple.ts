#!/usr/bin/env tsx
/**
 * Simple MongoDB Connection Test
 */

import { MongoClient } from 'mongodb'

// Get URI from environment variable - DO NOT hardcode credentials
const uri = process.env.MONGODB_URI

if (!uri) {
  console.error('❌ Error: MONGODB_URI environment variable is not set')
  console.error('💡 Set it in your .env file or pass it as an environment variable')
  process.exit(1)
}

// TypeScript type narrowing: uri is guaranteed to be a string after the check above
const mongoUri: string = uri

console.log('Testing MongoDB connection...')
console.log('URI:', mongoUri.replace(/:[^:@]+@/, ':****@'))
console.log('')

async function test() {
  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 10000,
  })

  try {
    console.log('Connecting...')
    await client.connect()
    console.log('✅ Connected!')
    
    await client.db().admin().ping()
    console.log('✅ Ping successful!')
    
    const dbs = await client.db().admin().listDatabases()
    console.log(`✅ Found ${dbs.databases.length} databases`)
    
    await client.close()
    console.log('✅ Connection closed')
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error))
    
    if (error instanceof Error && error.message.includes('ENOTFOUND')) {
      console.error('\n💡 The hostname "ads.nomaisj.mongodb.net" cannot be resolved.')
      console.error('💡 MongoDB Atlas hostnames usually look like: cluster0.xxxxx.mongodb.net')
      console.error('💡 Please check:')
      console.error('   1. Is the hostname correct?')
      console.error('   2. Is this a valid MongoDB Atlas cluster?')
      console.error('   3. Check your MongoDB Atlas dashboard for the correct connection string')
    }
  }
}

test()

