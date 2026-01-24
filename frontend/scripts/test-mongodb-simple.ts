#!/usr/bin/env tsx
/**
 * Simple MongoDB Connection Test
 */

import { MongoClient } from 'mongodb'

// Your MongoDB URI
const uri = 'mongodb+srv://adminuser:g0XinFH9CukeEkrX@ads.nomaisj.mongodb.net/?appName=ads'

console.log('Testing MongoDB connection...')
console.log('URI:', uri.replace(/:[^:@]+@/, ':****@'))
console.log('')

async function test() {
  const client = new MongoClient(uri, {
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

